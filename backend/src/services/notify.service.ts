import { emailQueue } from '../queue.js';
import { env } from '../env.js';
import type { EmailJobData } from '../types.js';

export async function queueEmail(job: EmailJobData) {
  await emailQueue.add(job.template, job, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
}

export async function queueChargeFailedAdminAlert(input: {
  bookingId: string;
  bookingReference: string | null;
  errorCode: string | null;
  errorMessage: string;
}) {
  await queueEmail({
    template: 'admin-charge-failed',
    bookingId: input.bookingId,
    recipient: env.ADMIN_ALERT_EMAIL,
    params: input,
  });
}

export async function queueDisputeAdminAlert(input: {
  bookingId: string;
  disputeId: string;
  amountCents: number;
  reason: string;
}) {
  await queueEmail({
    template: 'admin-dispute-opened',
    bookingId: input.bookingId,
    recipient: env.ADMIN_ALERT_EMAIL,
    params: input,
  });
}
