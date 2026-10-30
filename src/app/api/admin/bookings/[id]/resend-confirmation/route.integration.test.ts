import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { sendConfirmationEmail } from '@/lib/email';
import { createServerClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ authenticated: true }),
}));

vi.mock('@/lib/email', () => ({
  sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

const TEST_EMAIL_DOMAIN = '@resendtest.example';

// Day 61+ keeps these rows off the dates the other booking suites use (8-59).
function bookingDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 61);
  return date.toISOString().slice(0, 10);
}

function post(id: string) {
  return POST(new Request(`http://localhost/api/admin/bookings/${id}/resend-confirmation`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  'POST /api/admin/bookings/[id]/resend-confirmation',
  () => {
    const supabase = createServerClient();

    async function cleanup() {
      await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
    }

    // Each seeded row gets its own slot start so the one-team-per-slot index never trips.
    let seq = 0;
    async function seed(overrides: Record<string, unknown> = {}) {
      seq += 1;
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          first_name: 'Resend',
          last_name: `Test${seq}`,
          email: `guest${seq}${TEST_EMAIL_DOMAIN}`,
          phone: '5145551234',
          party_size: 8,
          booking_date: bookingDate(),
          slot_start: `1${seq}:00:00`,
          slot_end: '23:00:00',
          stripe_customer_id: 'cus_resend_test',
          stripe_payment_method_id: 'pm_resend_test',
          status: 'confirmed',
          ...overrides,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    async function reload(id: string) {
      const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
      return data!;
    }

    beforeEach(async () => {
      vi.mocked(sendConfirmationEmail).mockClear();
      vi.mocked(sendConfirmationEmail).mockResolvedValue(undefined);
      await cleanup();
    });

    afterEach(cleanup);

    it('returns 401 without sending when not authenticated', async () => {
      const booking = await seed();
      vi.mocked(requireAuth).mockResolvedValueOnce({
        authenticated: false,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      } as Awaited<ReturnType<typeof requireAuth>>);

      expect((await post(booking.id)).status).toBe(401);
      expect(sendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown booking', async () => {
      expect((await post(crypto.randomUUID())).status).toBe(404);
    });

    it.each(['pending', 'cancelled'])('refuses a %s booking without sending', async (status) => {
      const booking = await seed({ status });
      expect((await post(booking.id)).status).toBe(400);
      expect(sendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('sends the edited details and clears an earlier failure', async () => {
      const booking = await seed({ last_email_error: 'old', last_email_error_at: new Date().toISOString() });
      await supabase.from('bookings').update({ party_size: 12 }).eq('id', booking.id);

      expect((await post(booking.id)).status).toBe(200);
      expect(sendConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({ party_size: 12 }));
      const row = await reload(booking.id);
      expect(row.last_email_error).toBeNull();
      expect(row.last_email_error_at).toBeNull();
    });

    it('returns 502 and records the failure when sending fails', async () => {
      const booking = await seed();
      vi.mocked(sendConfirmationEmail).mockRejectedValueOnce(new Error('x'.repeat(600)));

      expect((await post(booking.id)).status).toBe(502);
      const row = await reload(booking.id);
      expect(row.last_email_error).toHaveLength(500);
      expect(row.last_email_error_at).not.toBeNull();
    });
  }
);
