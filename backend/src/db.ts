// Re-exports the existing service-role Supabase client (src/lib/supabase/server.ts) plus
// small helpers for the three tables this backend owns. No new DB client, no ORM — same
// createClient() call the Next.js app already uses, same service_role bypass-RLS access.
import { createServerClient } from '@/lib/supabase/server';
import type { ChargeAttempt, ChargeAttemptStatus, EmailLogEntry, EmailStatus } from './types.js';

export { createServerClient };

export function db() {
  return createServerClient();
}

/**
 * Insert a queued charge attempt. Returns the existing row instead of throwing when the
 * idempotency key already exists (UNIQUE violation, Postgres code 23505) — the caller
 * (POST /api/admin/bookings/:id/charge) decides what to do with an in-flight or already
 * resolved attempt rather than treating a duplicate request as an error.
 */
export async function insertChargeAttempt(input: {
  bookingId: string;
  idempotencyKey: string;
  amountCents: number;
  guestCount: number;
  triggeredBy: string;
}): Promise<{ attempt: ChargeAttempt; created: boolean }> {
  const supabase = db();

  const { data: inserted, error: insertError } = await supabase
    .from('charge_attempts')
    .insert({
      booking_id: input.bookingId,
      idempotency_key: input.idempotencyKey,
      amount_cents: input.amountCents,
      guest_count: input.guestCount,
      status: 'queued',
      triggered_by: input.triggeredBy,
    })
    .select()
    .single();

  if (!insertError) {
    return { attempt: inserted as ChargeAttempt, created: true };
  }

  // 23505 = unique_violation. Any other error is a real failure the caller should surface.
  if (insertError.code !== '23505') {
    throw insertError;
  }

  const { data: existing, error: fetchError } = await supabase
    .from('charge_attempts')
    .select()
    .eq('idempotency_key', input.idempotencyKey)
    .single();

  if (fetchError || !existing) {
    throw fetchError ?? new Error('Charge attempt insert conflicted but existing row was not found');
  }

  return { attempt: existing as ChargeAttempt, created: false };
}

export async function updateChargeAttempt(
  id: string,
  patch: Partial<{
    status: ChargeAttemptStatus;
    attempt_count: number;
    payment_intent_id: string | null;
    stripe_error_code: string | null;
    stripe_error_message: string | null;
  }>
) {
  const { error } = await db().from('charge_attempts').update(patch).eq('id', id);
  if (error) throw error;
}

export async function insertEmailLog(input: {
  bookingId: string | null;
  template: string;
  recipient: string;
  locale?: string;
  status: EmailStatus;
}) {
  const { data, error } = await db()
    .from('email_log')
    .insert({
      booking_id: input.bookingId,
      template: input.template,
      recipient: input.recipient,
      locale: input.locale,
      status: input.status,
    })
    .select()
    .single();
  if (error) throw error;
  return data as EmailLogEntry;
}

export async function updateEmailLog(
  id: string,
  patch: Partial<{ status: EmailStatus; attempt_count: number; message_id: string | null; error: string | null; sent_at: string | null }>
) {
  const { error } = await db().from('email_log').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Record a Stripe webhook event, or report that it was already recorded.
 * `created: false` means this event.id has been seen before — the caller should skip
 * processing rather than act on it twice.
 */
export async function recordWebhookEvent(event: {
  id: string;
  type: string;
  payload: unknown;
}): Promise<{ created: boolean }> {
  const { error } = await db()
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type, payload: event.payload });

  if (!error) return { created: true };

  // 23505 = unique_violation on the `id` primary key: Stripe redelivered an event we
  // already logged. Not an error — the caller skips processing it a second time.
  if ((error as { code?: string }).code === '23505') {
    return { created: false };
  }

  throw error;
}

export async function markWebhookEventProcessed(id: string, processError?: string) {
  const { error } = await db()
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString(), process_error: processError ?? null })
    .eq('id', id);
  if (error) throw error;
}
