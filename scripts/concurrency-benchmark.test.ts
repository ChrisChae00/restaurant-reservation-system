import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { getSlotsForDate, isRestaurantOpen } from '@/lib/booking-rules';
import { createServerClient } from '@/lib/supabase/server';

// Runs in-process against the real hosted DB (same technique as route.race.test.ts) so the
// result reflects the actual Postgres unique index, not a mock. Stripe/email are stubbed
// because a live Stripe key is configured here and 50 real emails must not go out.
// Set BENCHMARK_LEGACY=true when running this against the da67404 (pre-fix) worktree,
// where the route takes stripeCustomerId/stripePaymentMethodId directly and never calls Stripe.
const LEGACY = process.env.BENCHMARK_LEGACY === 'true';
const CONCURRENCY = 50;
const TEST_EMAIL_DOMAIN = '@loadtest.example';

vi.mock('@/lib/stripe', () => ({
  verifySetupIntent: vi.fn().mockResolvedValue({
    customerId: 'cus_bench_test',
    paymentMethodId: 'pm_bench_test',
  }),
}));

vi.mock('@/lib/email', () => ({
  sendNewReservationNotification: vi.fn().mockResolvedValue(undefined),
  sendReservationReceivedEmail: vi.fn().mockResolvedValue(undefined),
}));

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

const { date: bookingDateObj, slot } = findTestSlot();
const bookingDate = toDateOnlyString(bookingDateObj);

function buildBody(index: number) {
  const base = {
    firstName: 'Load',
    lastName: `Tester${index}`,
    email: `req-${index}${TEST_EMAIL_DOMAIN}`,
    phone: '5145551234',
    partySize: 8,
    bookingDate,
    slotId: slot.id,
    slotStart: slot.arrivalStart,
    slotEnd: slot.slotEnd,
    emailLanguage: 'en',
  };

  return LEGACY
    ? { ...base, stripeCustomerId: `cus_dummy_${index}`, stripePaymentMethodId: `pm_dummy_${index}` }
    : { ...base, setupIntentId: 'seti_bench_test' };
}

function buildRequest(index: number) {
  return new NextRequest('http://localhost/api/bookings', {
    method: 'POST',
    body: JSON.stringify(buildBody(index)),
  });
}

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
}

describe('concurrency benchmark', () => {
  it(`fires ${CONCURRENCY} concurrent bookings at the same slot (mode: ${LEGACY ? 'before/legacy' : 'after'})`, async () => {
    const supabase = createServerClient();
    await cleanup(supabase);

    const { POST } = await import('../src/app/api/bookings/route');

    const start = Date.now();
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => POST(buildRequest(i)))
    );
    const elapsedMs = Date.now() - start;

    const tally = new Map<number, number>();
    for (const r of responses) {
      tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
    }

    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .like('email', `%${TEST_EMAIL_DOMAIN}`);

    console.log('\n=== Concurrency benchmark result ===');
    console.log(`mode: ${LEGACY ? 'before/legacy (da67404)' : 'after (current)'}`);
    console.log(`requests: ${CONCURRENCY}, elapsed: ${elapsedMs}ms`);
    console.log('status tally:', Object.fromEntries(tally));
    console.log(`rows actually inserted in DB: ${count}`);
    console.log('=====================================\n');

    if (!LEGACY) {
      expect(tally.get(200)).toBe(1);
      expect(tally.get(409)).toBe(CONCURRENCY - 1);
      expect(count).toBe(1);
    }

    await cleanup(supabase);
  }, 60_000);
});
