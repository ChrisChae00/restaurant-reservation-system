// Admin login rate limiting, backed by Supabase so the count survives across serverless
// invocations (an in-memory counter would reset on every cold start / different instance).

import { createServerClient } from '@/lib/supabase/server';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/** True when this identifier has too many recent failed attempts to try again. */
export async function isRateLimited(identifier: string): Promise<boolean> {
  const supabase = createServerClient();
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from('admin_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('attempted_at', windowStart);

  if (error) {
    // Fail open: a rate-limit outage should not lock every admin out of the dashboard.
    console.error('Failed to check login rate limit:', error);
    return false;
  }

  return (count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(identifier: string): Promise<void> {
  const supabase = createServerClient();

  // Opportunistic cleanup of old rows so the table doesn't grow unbounded; cheap since it
  // only ever removes attempts more than an hour old.
  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from('admin_login_attempts').delete().lt('attempted_at', staleCutoff);

  const { error } = await supabase
    .from('admin_login_attempts')
    .insert({ identifier });

  if (error) {
    console.error('Failed to record login attempt:', error);
  }
}
