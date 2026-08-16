import { Worker, type Job } from 'bullmq';
import { sendNoShowChargeEmail } from '@/lib/email';
import type { Booking } from '@/types/booking';
import { connection } from '../queue.js';
import { db, insertEmailLog, updateEmailLog } from '../db.js';
import type { EmailLogEntry } from '../types.js';
import { chargeFailedAlertHtml, disputeAlertHtml, sendAdminAlert } from '../services/admin-mailer.js';
import { logger } from '../logger.js';
import type { EmailJobData } from '../types.js';

async function getBooking(id: string): Promise<Booking> {
  const { data, error } = await db().from('bookings').select().eq('id', id).single();
  if (error || !data) throw error ?? new Error(`Booking not found: ${id}`);
  return data as Booking;
}

/**
 * BullMQ re-invokes this processor on every retry, so a naive insert-per-invocation would
 * leave one email_log row per attempt instead of one row whose attempt_count climbs. On the
 * first attempt (attemptsMade === 0) a fresh row is created; every retry after that reuses
 * the most recent 'failed' row for the same booking/template rather than creating another.
 */
async function getOrCreateLogEntry(job: Job<EmailJobData>): Promise<EmailLogEntry> {
  if (job.attemptsMade === 0) {
    return insertEmailLog({
      bookingId: job.data.bookingId,
      template: job.data.template,
      recipient: job.data.recipient,
      locale: job.data.locale,
      status: 'queued',
    });
  }

  const { data, error } = await db()
    .from('email_log')
    .select()
    .eq('booking_id', job.data.bookingId)
    .eq('template', job.data.template)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as EmailLogEntry;

  // No prior failed row found (shouldn't normally happen) — fall back to a fresh row
  // rather than losing the record of this attempt.
  return insertEmailLog({
    bookingId: job.data.bookingId,
    template: job.data.template,
    recipient: job.data.recipient,
    locale: job.data.locale,
    status: 'queued',
  });
}

async function send(job: EmailJobData): Promise<{ messageId: string }> {
  switch (job.template) {
    case 'noshow-charge-receipt': {
      if (!job.bookingId) throw new Error('noshow-charge-receipt requires a bookingId');
      const booking = await getBooking(job.bookingId);
      const { amountCents, guestCount } = job.params as { amountCents: number; guestCount: number };
      await sendNoShowChargeEmail(booking, amountCents / 100, guestCount);
      return { messageId: 'sent-via-email-lib' }; // sendNoShowChargeEmail doesn't return one
    }
    case 'admin-charge-failed': {
      const params = job.params as { bookingId: string; errorCode: string | null; errorMessage: string };
      return sendAdminAlert({
        subject: `No-show charge failed — booking ${params.bookingId}`,
        html: chargeFailedAlertHtml(params),
      });
    }
    case 'admin-dispute-opened': {
      const params = job.params as { bookingId: string; disputeId: string; amountCents: number; reason: string };
      return sendAdminAlert({
        subject: `Dispute opened — booking ${params.bookingId}`,
        html: disputeAlertHtml(params),
      });
    }
    default:
      throw new Error(`Unknown email template: ${job.template}`);
  }
}

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(
    'email',
    async (job: Job<EmailJobData>) => {
      const logEntry = await getOrCreateLogEntry(job);

      try {
        const { messageId } = await send(job.data);
        await updateEmailLog(logEntry.id, {
          status: 'sent',
          attempt_count: job.attemptsMade + 1,
          message_id: messageId,
          sent_at: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateEmailLog(logEntry.id, {
          status: 'failed',
          attempt_count: job.attemptsMade + 1,
          error: message.slice(0, 500),
        });
        throw error; // let BullMQ's configured backoff (see notify.service.ts) retry
      }
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, template: job?.data.template, bookingId: job?.data.bookingId }, 'Email job failed');
  });

  return worker;
}
