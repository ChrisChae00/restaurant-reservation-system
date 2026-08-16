// Executes a queued no-show charge attempt. jobId == charge_attempts.idempotency_key
// (set at enqueue time in routes/admin.ts), so BullMQ itself refuses a duplicate job —
// the third of three independent duplicate-charge defenses, alongside the DB UNIQUE
// constraint on idempotency_key and Stripe's own idempotency key on the PaymentIntent
// (src/lib/stripe.ts chargeNoShowFee).
import { Worker, type Job } from 'bullmq';
import { chargeNoShowFee } from '@/lib/stripe';
import type { Booking } from '@/types/booking';
import { connection, chargeQueue, RETRY_DELAYS_MS } from '../queue.js';
import { db, updateChargeAttempt } from '../db.js';
import { classifyChargeFailure, stripeErrorCode, stripeErrorMessage } from '../services/charge.service.js';
import { queueChargeFailedAdminAlert, queueEmail } from '../services/notify.service.js';
import { logger } from '../logger.js';
import type { ChargeAttempt, ChargeJobData } from '../types.js';

async function getChargeAttempt(id: string): Promise<ChargeAttempt> {
  const { data, error } = await db().from('charge_attempts').select().eq('id', id).single();
  if (error || !data) throw error ?? new Error(`Charge attempt not found: ${id}`);
  return data as ChargeAttempt;
}

async function getBooking(id: string): Promise<Booking> {
  const { data, error } = await db().from('bookings').select().eq('id', id).single();
  if (error || !data) throw error ?? new Error(`Booking not found: ${id}`);
  return data as Booking;
}

// Exported separately from startChargeWorker so the charge path can be exercised without a
// live Redis connection (see charge.worker.test.ts).
export async function processChargeJob(job: Job<ChargeJobData>) {
  const attempt = await getChargeAttempt(job.data.chargeAttemptId);

  // A finished attempt should never be re-executed even if something re-enqueues its
  // job — this worker only spends Stripe calls on queued/processing/failed rows.
  if (attempt.status === 'succeeded' || attempt.status === 'disputed' || attempt.status === 'refunded') {
    return;
  }

  const booking = await getBooking(attempt.booking_id);
  const attemptNumber = attempt.attempt_count + 1;

  await updateChargeAttempt(attempt.id, {
    status: 'processing',
    attempt_count: attemptNumber,
  });

  let paymentIntent;
  try {
    paymentIntent = await chargeNoShowFee(
      booking.stripe_customer_id,
      booking.stripe_payment_method_id,
      attempt.guest_count,
      booking.id,
      attempt.amount_cents,
      // One charge_attempts row == at most one Stripe charge, forever. The row's own
      // idempotency_key is reused on every retry and every recovery of this row, which
      // is what makes an unknown outcome safe: a run that reached Stripe and charged
      // the card but never recorded it (worker crash before the status write, or a
      // connection error after Stripe accepted the request) comes back here, gets the
      // cached PaymentIntent replayed, and reconciles itself instead of charging the
      // guest a second time.
      //
      // Retrying a connection error with the *same* key is Stripe's own documented
      // recovery path ("if a connection error occurs, you can safely repeat the request
      // without risk of creating a second object"), and that is what this retry policy
      // mostly sees. Known tradeoff: a 5xx Stripe actually returned *is* saved and
      // replayed for 24h, so those retries re-read the same error and end at the admin
      // alert rather than a fresh charge -- the admin can then re-charge deliberately via
      // a new `-manual{n}` row. A wasted retry beats billing a guest twice.
      //
      // The insufficient-funds retry is the one case that needs a genuinely new charge,
      // and it waits out Stripe's 24h key retention (RETRY_DELAYS_MS in queue.ts) instead
      // of varying the key.
      //
      // An admin deliberately re-charging after a permanent failure gets a *new row*
      // with its own `-manual{n}` key (routes/admin.ts), so that path is unaffected.
      attempt.idempotency_key
    );
  } catch (error) {
    await handleChargeError(attempt, error);
    return;
  }

  // confirm:true can return without throwing while unsettled (requires_action,
  // processing) — recording that as succeeded would mark money collected that never
  // moved. Same rule the existing synchronous route enforces (charge-penalty/route.ts).
  if (paymentIntent.status !== 'succeeded') {
    await updateChargeAttempt(attempt.id, {
      status: paymentIntent.status === 'requires_action' ? 'requires_action' : 'failed',
      payment_intent_id: paymentIntent.id,
    });
    await queueChargeFailedAdminAlert({
      bookingId: booking.id,
      bookingReference: booking.booking_reference ?? null,
      errorCode: paymentIntent.status,
      errorMessage: `PaymentIntent did not succeed: ${paymentIntent.status}`,
    });
    return;
  }

  await updateChargeAttempt(attempt.id, { status: 'succeeded', payment_intent_id: paymentIntent.id });

  const { error: bookingUpdateError } = await db()
    .from('bookings')
    .update({
      status: 'noshow_charged',
      penalty_charged_at: new Date().toISOString(),
      penalty_amount: paymentIntent.amount,
      penalty_payment_intent_id: paymentIntent.id,
    })
    .eq('id', booking.id);

  if (bookingUpdateError) {
    // The card was already charged (charge_attempts already says succeeded, which is
    // the source of truth). Log loudly but don't fail the job — the webhook handler's
    // payment_intent.succeeded path retries this same write independently, so it
    // self-heals instead of requiring a human to reconcile Stripe against the dashboard.
    logger.error(
      { bookingUpdateError, bookingId: booking.id, paymentIntentId: paymentIntent.id },
      'Charged the card but failed to update the booking row'
    );
  }

  await queueEmail({
    template: 'noshow-charge-receipt',
    bookingId: booking.id,
    recipient: booking.email,
    locale: booking.email_language ?? undefined,
    params: { amountCents: paymentIntent.amount, guestCount: attempt.guest_count },
  });
}

export function startChargeWorker() {
  const worker = new Worker<ChargeJobData>('charge', processChargeJob, { connection });

  worker.on('failed', (job, err) => {
    logger.error({ err, chargeAttemptId: job?.data.chargeAttemptId }, 'Charge job failed');
  });

  return worker;
}

async function handleChargeError(attempt: ChargeAttempt, error: unknown) {
  const classification = classifyChargeFailure(error);
  const errorCode = stripeErrorCode(error);
  const errorMessage = stripeErrorMessage(error);

  await updateChargeAttempt(attempt.id, {
    status: 'failed',
    stripe_error_code: errorCode,
    stripe_error_message: errorMessage,
  });

  if (classification === 'permanent') {
    await queueChargeFailedAdminAlert({
      bookingId: attempt.booking_id,
      bookingReference: null,
      errorCode,
      errorMessage,
    });
    return; // no retry — a decline that will decline again isn't worth re-trying
  }

  const delays = classification === 'transient' ? RETRY_DELAYS_MS.transient : RETRY_DELAYS_MS.insufficientFunds;
  const nextAttemptIndex = attempt.attempt_count; // attempt_count was already incremented before this charge
  if (nextAttemptIndex >= delays.length) {
    // Retries exhausted for this class of failure — surface it like a permanent failure.
    await queueChargeFailedAdminAlert({
      bookingId: attempt.booking_id,
      bookingReference: null,
      errorCode,
      errorMessage: `${errorMessage} (retries exhausted)`,
    });
    return;
  }

  await chargeQueue.add(
    'retry',
    { chargeAttemptId: attempt.id, bookingId: attempt.booking_id },
    { delay: delays[nextAttemptIndex], jobId: `${attempt.idempotency_key}-retry-${nextAttemptIndex}` }
  );
}
