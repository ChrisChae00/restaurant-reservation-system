import type { createServerClient } from '@/lib/supabase/server';

type Supabase = ReturnType<typeof createServerClient>;

// Record that a guest notification failed so the admin dashboard can surface it, instead of
// the failure being visible only in server logs.
export async function recordEmailFailure(supabase: Supabase, bookingId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      last_email_error: message.slice(0, 500),
      last_email_error_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  // The dashboard badge is now missing for a guest who got no email; the log is the only trace.
  if (updateError) {
    console.error('Failed to record email failure for booking', bookingId, updateError);
  }
}

// Clear the failure badge once the guest has received a correct email.
export async function clearEmailFailure(supabase: Supabase, bookingId: string) {
  const { error } = await supabase
    .from('bookings')
    .update({ last_email_error: null, last_email_error_at: null })
    .eq('id', bookingId);

  // A stale badge would invite a duplicate resend, so leave a trace when this fails.
  if (error) {
    console.error('Failed to clear email failure for booking', bookingId, error);
  }
}
