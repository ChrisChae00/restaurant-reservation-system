// Two scheduled jobs. Neither charges a card automatically — that decision stays with a
// human, because there's no check-in flow to tell a genuine no-show apart from a guest who
// simply came and went without staff touching the booking (see plan doc, "명시적 비목표").
import { Queue, Worker } from 'bullmq';
import { connection } from '../queue.js';
import { db } from '../db.js';
import { chargeQueue } from '../queue.js';
import { escapeHtml, sendAdminAlert } from '../services/admin-mailer.js';
import { logger } from '../logger.js';
import type { Booking } from '@/types/booking';
import type { ChargeAttempt } from '../types.js';

const schedulerQueue = new Queue('scheduler', { connection });

const STUCK_ATTEMPT_THRESHOLD_MS = 60 * 60_000; // 1 hour

/**
 * Daily reminder: bookings whose slot ended yesterday but are still 'confirmed' — i.e. no
 * one marked them completed or charged. This does not imply no-show; it means the booking
 * needs a human glance. Framed as a reminder, not an accusation.
 *
 * ponytail: scans by booking_date + status, both indexed (idx_bookings_date_slot,
 * idx_bookings_status from 001_create_bookings.sql). Revisit with a dedicated composite
 * index if daily volume grows past low hundreds.
 */
async function sendUnresolvedBookingsReminder() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10);

  const { data, error } = await db()
    .from('bookings')
    .select('id, booking_reference, first_name, last_name, party_size, slot_start, slot_end')
    .eq('booking_date', yesterday)
    .eq('status', 'confirmed');

  if (error) {
    logger.error({ error }, 'Failed to query unresolved bookings for reminder');
    return;
  }

  const bookings = (data ?? []) as Pick<
    Booking,
    'id' | 'booking_reference' | 'first_name' | 'last_name' | 'party_size' | 'slot_start' | 'slot_end'
  >[];

  if (bookings.length === 0) return;

  const rows = bookings
    .map((b) => {
      const ref = escapeHtml(b.booking_reference ?? b.id.slice(0, 8));
      const name = escapeHtml(`${b.first_name} ${b.last_name}`);
      return `<li>#${ref} — ${name}, ${b.party_size} guests, ${b.slot_start}–${b.slot_end}</li>`;
    })
    .join('');

  await sendAdminAlert({
    subject: `${bookings.length} unresolved booking(s) from ${yesterday}`,
    html: `
      <p>These bookings from ${yesterday} are still marked "confirmed" — no one marked them
      completed or charged a no-show fee. If a guest didn't show, charge them from the
      dashboard; otherwise mark the booking completed.</p>
      <ul>${rows}</ul>
    `,
  });
}

/**
 * Safety net: re-queue charge attempts stuck in queued/processing for over an hour. Covers
 * a worker crash or Redis restart losing an in-flight job — the DB row is the source of
 * truth, so anything left dangling there gets a fresh job.
 */
async function recoverStuckChargeAttempts() {
  const cutoff = new Date(Date.now() - STUCK_ATTEMPT_THRESHOLD_MS).toISOString();

  const { data, error } = await db()
    .from('charge_attempts')
    .select()
    .in('status', ['queued', 'processing'])
    .lt('updated_at', cutoff);

  if (error) {
    logger.error({ error }, 'Failed to query stuck charge attempts');
    return;
  }

  for (const attempt of (data ?? []) as ChargeAttempt[]) {
    logger.warn({ chargeAttemptId: attempt.id }, 'Recovering stuck charge attempt');
    await chargeQueue.add(
      'recover',
      { chargeAttemptId: attempt.id, bookingId: attempt.booking_id },
      { jobId: `${attempt.idempotency_key}-recover-${Date.now()}` }
    );
  }
}

export async function startScheduler() {
  await schedulerQueue.add(
    'unresolved-bookings-reminder',
    {},
    { repeat: { pattern: '0 10 * * *', tz: process.env.TZ ?? 'America/Toronto' }, jobId: 'unresolved-bookings-reminder' }
  );
  await schedulerQueue.add(
    'recover-stuck-charges',
    {},
    { repeat: { pattern: '*/10 * * * *' }, jobId: 'recover-stuck-charges' }
  );

  return new Worker(
    'scheduler',
    async (job) => {
      if (job.name === 'unresolved-bookings-reminder') await sendUnresolvedBookingsReminder();
      if (job.name === 'recover-stuck-charges') await recoverStuckChargeAttempts();
    },
    { connection }
  ).on('failed', (job, err) => logger.error({ err, job: job?.name }, 'Scheduler job failed'));
}
