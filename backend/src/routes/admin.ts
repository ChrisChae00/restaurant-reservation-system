import { Router } from 'express';
import { z } from 'zod';
import { NO_SHOW_FEE_PER_PERSON } from '@/lib/stripe';
import { db, insertChargeAttempt } from '../db.js';
import { chargeQueue } from '../queue.js';
import { internalAuth } from '../middleware/internal-auth.js';
import { logger } from '../logger.js';
import type { ChargeAttempt } from '../types.js';

export const adminRouter = Router();
adminRouter.use(internalAuth);

// Mirrors chargePenaltyRequestSchema in src/lib/validations.ts: guestCount is an optional
// positive integer, customAmount is optional dollars capped so a malformed or malicious
// body can't push a charge past what any booking could legitimately owe.
const MAX_PARTY_SIZE = 14; // matches the CHECK constraint on bookings.party_size
const chargeBodySchema = z.object({
  guestCount: z.number().int().positive().max(MAX_PARTY_SIZE).optional(),
  customAmount: z
    .number()
    .positive()
    .max((NO_SHOW_FEE_PER_PERSON * MAX_PARTY_SIZE) / 100)
    .optional(),
});

const bookingIdParamSchema = z.string().uuid();

/**
 * POST /api/admin/bookings/:id/charge
 *
 * Mirrors the guard order of the existing synchronous route
 * (src/app/api/admin/charge-penalty/route.ts:49-73): already charged, missing card info,
 * guest count over party size. The difference is what happens after the guards pass —
 * this enqueues a job and returns immediately instead of calling Stripe inline.
 */
adminRouter.post('/bookings/:id/charge', async (req, res) => {
  const idResult = bookingIdParamSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: 'Invalid booking id' });
    return;
  }
  const bookingId = idResult.data;

  const bodyResult = chargeBodySchema.safeParse(req.body ?? {});
  if (!bodyResult.success) {
    res.status(400).json({ error: 'Invalid request', details: bodyResult.error.issues });
    return;
  }
  const { guestCount, customAmount } = bodyResult.data;

  const { data: booking, error: fetchError } = await db().from('bookings').select().eq('id', bookingId).single();
  if (fetchError || !booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (booking.status === 'noshow_charged') {
    res.status(400).json({ error: 'Penalty already charged for this booking' });
    return;
  }

  if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
    res.status(400).json({ error: 'Missing payment information' });
    return;
  }

  const chargeGuestCount = guestCount ?? booking.party_size;
  if (chargeGuestCount > booking.party_size) {
    res.status(400).json({ error: 'Guest count cannot exceed party size' });
    return;
  }

  // customAmount is already capped by the schema above, but re-derive from the booking's
  // actual party size too: the schema's ceiling uses MAX_PARTY_SIZE, which is looser than
  // this specific booking's real party size.
  const amountCents = customAmount
    ? Math.min(Math.round(customAmount * 100), NO_SHOW_FEE_PER_PERSON * booking.party_size)
    : NO_SHOW_FEE_PER_PERSON * chargeGuestCount;
  const idempotencyKey = `noshow-${bookingId}-${amountCents}`;

  const { attempt, created } = await insertChargeAttempt({
    bookingId,
    idempotencyKey,
    amountCents,
    guestCount: chargeGuestCount,
    triggeredBy: req.header('x-admin-user') ?? 'admin',
  });

  if (!created) {
    const response = describeExistingAttempt(attempt);
    res.status(response.status).json(response.body);
    return;
  }

  await chargeQueue.add(
    'charge',
    { chargeAttemptId: attempt.id, bookingId },
    { jobId: idempotencyKey }
  );

  logger.info({ chargeAttemptId: attempt.id, bookingId }, 'Charge attempt queued');
  res.status(202).json({ chargeAttemptId: attempt.id, status: attempt.status });
});

function describeExistingAttempt(attempt: ChargeAttempt): { status: number; body: Record<string, unknown> } {
  if (attempt.status === 'succeeded') {
    return { status: 409, body: { error: 'Penalty already charged for this booking', chargeAttemptId: attempt.id } };
  }
  // queued/processing/failed/requires_action/disputed/refunded — return the existing
  // attempt rather than creating a second job for the same idempotency key.
  return { status: 202, body: { chargeAttemptId: attempt.id, status: attempt.status } };
}

adminRouter.get('/charges', async (req, res) => {
  const status = req.query.status as string | undefined;
  let query = db().from('charge_attempts').select().order('created_at', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ attempts: data });
});

adminRouter.get('/charges/:bookingId', async (req, res) => {
  const { data, error } = await db()
    .from('charge_attempts')
    .select()
    .eq('booking_id', req.params.bookingId)
    .order('created_at', { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ attempts: data });
});

adminRouter.get('/email-log', async (req, res) => {
  const bookingId = req.query.bookingId as string | undefined;
  let query = db().from('email_log').select().order('created_at', { ascending: false }).limit(200);
  if (bookingId) query = query.eq('booking_id', bookingId);
  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ emails: data });
});

adminRouter.get('/webhook-events', async (req, res) => {
  const processed = req.query.processed as string | undefined;
  let query = db().from('stripe_webhook_events').select().order('received_at', { ascending: false }).limit(200);
  if (processed === 'false') query = query.is('processed_at', null);
  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ events: data });
});
