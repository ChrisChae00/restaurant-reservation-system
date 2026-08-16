// Small standalone transporter for admin-facing alerts (charge failed, dispute opened).
// The guest-facing templates in src/lib/email.ts (sendNoShowChargeEmail etc.) are reused
// as-is; they're not exported to add new templates onto, and admin alerts are simple
// enough not to warrant extending that file's retry/i18n machinery. BullMQ's own 3x
// exponential-backoff retry on the email queue covers transient send failures here.
import nodemailer from 'nodemailer';
import { env } from '../env.js';

const RESTAURANT_NAME = 'Restaurant Coréen Luna';

// Guest-entered fields (name, booking reference) and Stripe-provided strings (error
// messages, dispute reasons) both end up interpolated into admin alert HTML — neither is
// trusted markup. Escape before every interpolation.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
});

export async function sendAdminAlert(input: {
  subject: string;
  html: string;
}): Promise<{ messageId: string }> {
  if (env.DISABLE_EMAIL_SENDING) {
    return { messageId: 'disabled' };
  }
  const info = await transporter.sendMail({
    from: `"${RESTAURANT_NAME}" <${env.GMAIL_USER}>`,
    to: env.ADMIN_ALERT_EMAIL,
    subject: input.subject,
    html: input.html,
  });
  return { messageId: info.messageId };
}

export function chargeFailedAlertHtml(input: {
  bookingId: string;
  errorCode: string | null;
  errorMessage: string;
}): string {
  return `
    <p>A no-show charge attempt failed and will not be retried further.</p>
    <ul>
      <li>Booking ID: ${escapeHtml(input.bookingId)}</li>
      <li>Error code: ${escapeHtml(input.errorCode ?? 'unknown')}</li>
      <li>Error: ${escapeHtml(input.errorMessage)}</li>
    </ul>
    <p>Check the admin dashboard's charge history for this booking.</p>
  `;
}

export function disputeAlertHtml(input: {
  bookingId: string;
  disputeId: string;
  amountCents: number;
  reason: string;
}): string {
  return `
    <p>A guest has disputed a no-show charge.</p>
    <ul>
      <li>Booking ID: ${escapeHtml(input.bookingId)}</li>
      <li>Dispute ID: ${escapeHtml(input.disputeId)}</li>
      <li>Amount: $${(input.amountCents / 100).toFixed(2)} CAD</li>
      <li>Reason: ${escapeHtml(input.reason)}</li>
    </ul>
    <p>Respond to this dispute in the Stripe dashboard.</p>
  `;
}
