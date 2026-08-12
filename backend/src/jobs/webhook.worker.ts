// Processes recorded Stripe webhook events: reconciles charge_attempts / bookings, and
// queues admin alerts for failures and disputes. Split from the webhooks route so a slow
// DB write or email enqueue never delays the 200 Stripe is waiting for.
import { Queue, Worker, type Job } from 'bullmq';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { connection } from '../queue.js';
import { db, markWebhookEventProcessed, updateChargeAttempt } from '../db.js';
import { queueChargeFailedAdminAlert, queueDisputeAdminAlert } from '../services/notify.service.js';
import { logger } from '../logger.js';
import type { ChargeAttempt } from '../types.js';

interface WebhookJobData {
  eventId: string;
}

export const webhookQueue = new Queue<WebhookJobData>('webhook', { connection });

export const WEBHOOK_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'fixed' as const, delay: 30_000 },
};

async function findChargeAttemptByPaymentIntent(paymentIntentId: string): Promise<ChargeAttempt | null> {
  const { data, error } = await db()
    .from('charge_attempts')
    .select()
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  return (data as ChargeAttempt | null) ?? null;
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const attempt = await findChargeAttemptByPaymentIntent(intent.id);
  if (!attempt) return; // not one of our no-show charges

  if (attempt.status === 'succeeded') return; // already reconciled by the charge worker itself

  await updateChargeAttempt(attempt.id, { status: 'succeeded' });

  const { error } = await db()
    .from('bookings')
    .update({
      status: 'noshow_charged',
      penalty_charged_at: new Date().toISOString(),
      penalty_amount: intent.amount,
      penalty_payment_intent_id: intent.id,
    })
    .eq('id', attempt.booking_id)
    .neq('status', 'noshow_charged'); // don't clobber a row the charge worker already wrote
  if (error) throw error;
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const attempt = await findChargeAttemptByPaymentIntent(intent.id);
  if (!attempt || attempt.status === 'succeeded') return;

  const message = intent.last_payment_error?.message ?? 'Payment failed';
  await updateChargeAttempt(attempt.id, {
    status: 'failed',
    stripe_error_code: intent.last_payment_error?.code ?? null,
    stripe_error_message: message,
  });

  await queueChargeFailedAdminAlert({
    bookingId: attempt.booking_id,
    bookingReference: null,
    errorCode: intent.last_payment_error?.code ?? null,
    errorMessage: message,
  });
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const stripe = getStripe();
  const charge = await stripe.charges.retrieve(dispute.charge as string);
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const attempt = await findChargeAttemptByPaymentIntent(paymentIntentId);
  if (!attempt) return;

  await updateChargeAttempt(attempt.id, { status: 'disputed' });

  await queueDisputeAdminAlert({
    bookingId: attempt.booking_id,
    disputeId: dispute.id,
    amountCents: dispute.amount,
    reason: dispute.reason,
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const attempt = await findChargeAttemptByPaymentIntent(paymentIntentId);
  if (!attempt) return;
  await updateChargeAttempt(attempt.id, { status: 'refunded' });
}

export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    'webhook',
    async (job: Job<WebhookJobData>) => {
      const { data: row, error } = await db()
        .from('stripe_webhook_events')
        .select()
        .eq('id', job.data.eventId)
        .single();
      if (error || !row) throw error ?? new Error('Webhook event row not found');

      const event = row.payload as Stripe.Event;

      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;
        case 'charge.dispute.created':
          await handleDisputeCreated(event.data.object as Stripe.Dispute);
          break;
        case 'charge.refunded':
          await handleChargeRefunded(event.data.object as Stripe.Charge);
          break;
        default:
          // Unhandled event types are expected — acknowledged without action.
          break;
      }

      // processed_at marks "handling finished" — reaching here means it succeeded.
      await markWebhookEventProcessed(job.data.eventId);
    },
    { connection }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ err, eventId: job?.data.eventId, attempt: job?.attemptsMade }, 'Webhook job failed');
    // Only record a terminal failure once BullMQ has exhausted retries — a transient
    // failure mid-retry should leave processed_at null, not look like a dead end.
    if (job && job.attemptsMade >= WEBHOOK_JOB_OPTS.attempts) {
      const message = err instanceof Error ? err.message : String(err);
      await markWebhookEventProcessed(job.data.eventId, message).catch((e) =>
        logger.error({ e }, 'Failed to record terminal webhook processing error')
      );
    }
  });

  return worker;
}
