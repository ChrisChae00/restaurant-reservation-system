import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSlotsForDate, isRestaurantOpen } from '@/lib/booking-rules';
import { createServerClient } from '@/lib/supabase/server';

// Real Postgres unique index (idx_bookings_one_team_per_slot) is what this test proves —
// a fully mocked Supabase client would just replay whatever we hardcoded and could never
// catch a reverted migration. Stripe and email are the only things stubbed.
vi.mock('@/lib/stripe', () => ({
  verifySetupIntent: vi.fn().mockResolvedValue({
    customerId: 'cus_race_test',
    paymentMethodId: 'pm_race_test',
  }),
}));

vi.mock('@/lib/email', () => ({
  sendNewReservationNotification: vi.fn().mockResolvedValue(undefined),
  sendReservationReceivedEmail: vi.fn().mockResolvedValue(undefined),
}));

const CONCURRENCY = 10;
const TEST_EMAIL_DOMAIN = '@racetest.example';

// Any open weekday at least 8 days out clears both the past-date and the
// within-7-days admin-approval checks without needing an allowed_dates row.
function findTestSlot() {
  for (let offset = 8; offset < 30; offset++) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    if (isRestaurantOpen(date)) {
      const [slot] = getSlotsForDate(date);
      return { date, slot };
    }
  }
  throw new Error('No open day found in range');
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const { date: bookingDateObj, slot } = findTestSlot();
const bookingDate = toDateOnlyString(bookingDateObj);

function buildRequest(index: number) {
  return new NextRequest('http://localhost/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Race',
      lastName: `Tester${index}`,
      email: `racer-${index}${TEST_EMAIL_DOMAIN}`,
      phone: '5145551234',
      partySize: 8,
      bookingDate,
      slotId: slot.id,
      slotStart: slot.arrivalStart,
      slotEnd: slot.slotEnd,
      emailLanguage: 'en',
      setupIntentId: 'seti_race_test',
    }),
  });
}

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
}

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)('POST /api/bookings race condition', () => {
  const supabase = createServerClient();

  beforeEach(async () => {
    await cleanup(supabase);
  });

  afterEach(async () => {
    await cleanup(supabase);
  });

  it('lets exactly one of many concurrent requests for the same slot win', async () => {
    const { POST } = await import('./route');

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => POST(buildRequest(i)))
    );
    const bodies = await Promise.all(responses.map((r) => r.json()));

    const successes = responses.filter((r) => r.status === 200);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(CONCURRENCY - 1);
    for (const body of bodies.filter((_, i) => responses[i].status === 409)) {
      expect(body.error).toBe('Time slot no longer available');
    }

    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('booking_date', bookingDate)
      .eq('slot_start', slot.arrivalStart)
      .like('email', `%${TEST_EMAIL_DOMAIN}`);

    expect(count).toBe(1);
  });
});
