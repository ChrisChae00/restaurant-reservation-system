// Measures the no-show charge pipeline against a real Stripe test-mode account and the real
// hosted Supabase DB — same technique as concurrency-benchmark.test.ts, applied to the
// charge path instead of the booking path. This is the source of the Before/After numbers
// in docs/reliability-report.md; it is not part of `npm test` (excluded — lives outside src/).
//
// Usage:
//   BENCHMARK_TARGET=legacy npx vitest run scripts/charge-pipeline-benchmark.test.ts   # before
//   BENCHMARK_TARGET=backend npx vitest run scripts/charge-pipeline-benchmark.test.ts  # after
//     (target=backend requires `cd backend && npm run dev` running first, with
//      STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET in backend/.env pointed at the same
//      Stripe test-mode account as STRIPE_TEST_SECRET_KEY below)
//
// Requires STRIPE_TEST_SECRET_KEY (sk_test_...) and SUPABASE_SERVICE_ROLE_KEY in .env.local.
// Refuses to run against a live key — this creates and charges real PaymentIntents.
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase/server';

const TARGET = (process.env.BENCHMARK_TARGET === 'backend' ? 'backend' : 'legacy') as 'legacy' | 'backend';
const ITERATIONS = 20;
const TEST_EMAIL_DOMAIN = '@benchmarktest.example';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

const testKey = process.env.STRIPE_TEST_SECRET_KEY;
const hasCreds = Boolean(testKey && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Stripe now issues restricted keys (rk_test_) by default alongside standard secret keys
// (sk_test_) — both are valid test-mode keys, just with different permission scoping.
if (testKey && !testKey.startsWith('sk_test_') && !testKey.startsWith('rk_test_')) {
  throw new Error(
    'STRIPE_TEST_SECRET_KEY must be a sk_test_ or rk_test_ key — refusing to run a charge benchmark against a live key.'
  );
}

// src/lib/stripe.ts reads STRIPE_SECRET_KEY lazily on first use and caches the client, so
// overriding it here (before any route/lib import touches Stripe) routes every charge in
// this process through the test-mode account without touching .env.local's live key.
if (testKey) {
  process.env.STRIPE_SECRET_KEY = testKey;
}

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ authenticated: true }),
}));

vi.mock('@/lib/email', () => ({
  sendNoShowChargeEmail: vi.fn().mockResolvedValue(undefined),
}));

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function summarize(label: string, latenciesMs: number[]) {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  console.log(`\n${label}`);
  console.log(`  n=${sorted.length}  p50=${percentile(sorted, 50)}ms  p95=${percentile(sorted, 95)}ms  max=${sorted[sorted.length - 1]}ms`);
}

/**
 * pm_card_visa is one of Stripe's documented test-mode PaymentMethod tokens for off-session
 * charging. Attaching it to a Customer directly and charging off-session immediately gets
 * declined as insufficient_funds by Radar's test rules — a raw attach has no record of the
 * card ever being confirmed on-session, exactly the "unauthenticated first use" pattern the
 * production flow avoids. The real booking flow (src/lib/stripe.ts createSetupIntent, then
 * verifySetupIntent) runs a SetupIntent through confirm before the card is ever saved, so
 * this reproduces that for the success card: attach, then create+confirm a
 * `usage: off_session` SetupIntent, before charging.
 * https://docs.stripe.com/testing#saving-card-details
 *
 * The decline-scenario token declines on *any* API call that touches it, including a plain
 * paymentMethods.attach() — not just a confirm. Stripe's documented pattern for these
 * tokens is to skip attach/SetupIntent entirely and pass the magic token string straight
 * through as the `payment_method` on the PaymentIntent that's supposed to decline; Stripe
 * recognizes the literal token and simulates the decline without it ever being "saved".
 */
async function createTestCustomerWithCard(stripe: Stripe, paymentMethodToken: string) {
  const customer = await stripe.customers.create({ email: `bench-${Date.now()}${TEST_EMAIL_DOMAIN}` });
  const pm = await stripe.paymentMethods.attach(paymentMethodToken, { customer: customer.id });
  await stripe.setupIntents.create({
    customer: customer.id,
    payment_method: pm.id,
    payment_method_types: ['card'],
    usage: 'off_session',
    confirm: true,
  });
  return { customerId: customer.id, paymentMethodId: pm.id };
}

/** Customer for the decline scenario, without ever attaching the decline token (see above). */
async function createDeclineTestCustomer(stripe: Stripe, paymentMethodToken: string) {
  const customer = await stripe.customers.create({ email: `bench-decline-${Date.now()}${TEST_EMAIL_DOMAIN}` });
  return { customerId: customer.id, paymentMethodId: paymentMethodToken };
}

async function insertTestBooking(
  supabase: ReturnType<typeof createServerClient>,
  card: { customerId: string; paymentMethodId: string },
  index: number
) {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      first_name: 'Benchmark',
      last_name: `Guest${index}`,
      email: `req-${index}-${Date.now()}${TEST_EMAIL_DOMAIN}`,
      phone: '5145551234',
      party_size: 8,
      booking_date: '2099-01-01', // far future, never collides with real availability queries
      slot_start: '18:00:00',
      slot_end: '20:00:00',
      stripe_customer_id: card.customerId,
      stripe_payment_method_id: card.paymentMethodId,
      status: 'confirmed',
      bypassed_slot_limit: true,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error('Failed to insert benchmark booking');
  return data as { id: string };
}

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
}

async function waitForChargeAttemptsToSettle(
  supabase: ReturnType<typeof createServerClient>,
  chargeAttemptIds: string[],
  timeoutMs = 20000
) {
  const terminal = new Set(['succeeded', 'failed', 'requires_action', 'disputed', 'refunded']);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await supabase.from('charge_attempts').select('id, status').in('id', chargeAttemptIds);
    const settled = (data ?? []).filter((row) => terminal.has(row.status)).length;
    if (settled >= chargeAttemptIds.length) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.warn(`waitForChargeAttemptsToSettle: timed out after ${timeoutMs}ms with attempts still in-flight`);
}

async function assertBackendReachable() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(
      `BENCHMARK_TARGET=backend requires the backend running at ${BACKEND_URL} (cd backend && npm run dev). ${err}`
    );
  }
}

describe.skipIf(!hasCreds)('charge pipeline benchmark', () => {
  const supabase = createServerClient();
  const stripe = new Stripe(testKey!, { apiVersion: '2025-11-17.clover', typescript: true });

  beforeAll(async () => {
    if (TARGET === 'backend') await assertBackendReachable();
    await cleanup(supabase);
  });
  afterAll(async () => cleanup(supabase));

  it(`records p50/p95 charge latency and DB-record rate on failure (mode: ${TARGET})`, async () => {
    let successCard: { customerId: string; paymentMethodId: string };
    try {
      successCard = await createTestCustomerWithCard(stripe, 'pm_card_visa');
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        console.error('DEBUG createTestCustomerWithCard(pm_card_visa) failed:', {
          type: err.type,
          code: err.code,
          declineCode: (err as Stripe.errors.StripeCardError).decline_code,
          message: err.message,
          requestId: err.requestId,
        });
      }
      throw err;
    }

    let declineCard: { customerId: string; paymentMethodId: string };
    try {
      declineCard = await createDeclineTestCustomer(stripe, 'pm_card_visa_chargeDeclinedInsufficientFunds');
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        console.error('DEBUG createTestCustomerWithCard(decline token) failed:', {
          type: err.type,
          code: err.code,
          declineCode: (err as Stripe.errors.StripeCardError).decline_code,
          message: err.message,
          requestId: err.requestId,
        });
      }
      throw err;
    }

    // --- Successful charges: measure request latency ---
    // In backend mode this only measures the enqueue round-trip (202) — the actual Stripe
    // charge happens asynchronously in the worker. chargeAttemptIds is collected so the
    // test can wait for the queue to fully drain before cleanup() deletes the underlying
    // booking rows out from under a still-running job.
    const successLatenciesMs: number[] = [];
    const chargeAttemptIds: string[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const booking = await insertTestBooking(supabase, successCard, i);
      const start = Date.now();

      if (TARGET === 'legacy') {
        const { POST } = await import('../src/app/api/admin/charge-penalty/route');
        const response = await POST(
          new NextRequest('http://localhost/api/admin/charge-penalty', {
            method: 'POST',
            body: JSON.stringify({ bookingId: booking.id }),
          })
        );
        // requireAuth() is mocked to always authenticate, so POST always returns a
        // NextResponse here — the `| undefined` in its type only covers the auth-failure
        // branch, which this benchmark never takes.
        expect(response?.status).toBe(200);
      } else {
        const response = await fetch(`${BACKEND_URL}/api/admin/bookings/${booking.id}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.BACKEND_INTERNAL_SECRET ?? '' },
          body: JSON.stringify({}),
        });
        expect(response.status).toBe(202);
        const { chargeAttemptId } = await response.json();
        chargeAttemptIds.push(chargeAttemptId);
      }

      successLatenciesMs.push(Date.now() - start);
    }
    summarize(`Charge request latency — successful charge (${TARGET})`, successLatenciesMs);

    if (TARGET === 'backend') {
      await waitForChargeAttemptsToSettle(supabase, chargeAttemptIds);
    }

    // --- Declined charge: does a failure get recorded anywhere queryable? ---
    const declineBooking = await insertTestBooking(supabase, declineCard, 999);
    if (TARGET === 'legacy') {
      const { POST } = await import('../src/app/api/admin/charge-penalty/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/charge-penalty', {
          method: 'POST',
          body: JSON.stringify({ bookingId: declineBooking.id }),
        })
      );
      const { data: bookingAfter } = await supabase.from('bookings').select().eq('id', declineBooking.id).single();
      console.log('\nDeclined charge — legacy path:');
      console.log(`  response status: ${response?.status}`);
      console.log(`  booking.status changed from 'confirmed': ${bookingAfter?.status !== 'confirmed'}`);
      console.log('  no charge_attempts table exists in this schema — failure is unrecorded beyond this HTTP response');
    } else {
      const response = await fetch(`${BACKEND_URL}/api/admin/bookings/${declineBooking.id}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.BACKEND_INTERNAL_SECRET ?? '' },
        body: JSON.stringify({}),
      });
      const { chargeAttemptId } = await response.json();
      await waitForChargeAttemptsToSettle(supabase, [chargeAttemptId]);
      const { data: attempt } = await supabase.from('charge_attempts').select().eq('id', chargeAttemptId).single();
      console.log('\nDeclined charge — backend path:');
      console.log(`  charge_attempts row: status=${attempt?.status}, error_code=${attempt?.stripe_error_code}, error_message=${attempt?.stripe_error_message}, attempt_count=${attempt?.attempt_count}`);
    }
  }, 120_000);
});
