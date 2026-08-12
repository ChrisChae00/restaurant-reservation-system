export type ChargeAttemptStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'requires_action'
  | 'disputed'
  | 'refunded';

export interface ChargeAttempt {
  id: string;
  booking_id: string;
  idempotency_key: string;
  amount_cents: number;
  guest_count: number;
  status: ChargeAttemptStatus;
  attempt_count: number;
  payment_intent_id: string | null;
  stripe_error_code: string | null;
  stripe_error_message: string | null;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailStatus = 'queued' | 'sent' | 'failed';

export interface EmailLogEntry {
  id: string;
  booking_id: string | null;
  template: string;
  recipient: string;
  locale: string | null;
  status: EmailStatus;
  attempt_count: number;
  message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface ChargeJobData {
  chargeAttemptId: string;
  bookingId: string;
}

export interface EmailJobData {
  template: string;
  bookingId: string | null;
  recipient: string;
  locale?: string;
  params: Record<string, unknown>;
}

/**
 * Classification of a failed Stripe charge attempt. Drives whether — and how long — the
 * charge worker waits before retrying.
 *   - transient: infrastructure hiccup, safe to retry soon (network, rate limit, 5xx)
 *   - insufficient_funds: the card itself is fine, retry later so a balance can refill
 *   - permanent: retrying changes nothing (expired card, hard decline, unrecognized code)
 */
export type ChargeFailureClass = 'transient' | 'insufficient_funds' | 'permanent';
