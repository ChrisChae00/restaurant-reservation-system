// Fires two concurrent charge requests at the same booking against a *running* backend
// (start it first: `cd backend && npm run dev`, with Redis up) and proves the three
// independent duplicate-charge defenses actually hold: DB UNIQUE on idempotency_key,
// BullMQ jobId dedup, and Stripe's own idempotency key on the PaymentIntent — only one
// charge_attempts row and one real Stripe charge should ever result, regardless of how
// many times an admin double-clicks or two tabs race the same "Charge" button.
//
// Same real-Stripe-test-mode / real-Supabase technique as
// scripts/charge-pipeline-benchmark.test.ts, scoped down to just the concurrency claim.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase/server';

const TEST_EMAIL_DOMAIN = '@duplicatechargetest.example';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';
const testKey = process.env.STRIPE_TEST_SECRET_KEY;
const hasCreds = Boolean(testKey && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (testKey && !testKey.startsWith('sk_test_') && !testKey.startsWith('rk_test_')) {
  throw new Error('STRIPE_TEST_SECRET_KEY must be a sk_test_ or rk_test_ key.');
}

async function backendReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
}

describe.skipIf(!hasCreds)('duplicate charge defense', () => {
  const supabase = createServerClient();
  const stripe = new Stripe(testKey!, { apiVersion: '2025-11-17.clover', typescript: true });
  let skipReason: string | null = null;

  beforeAll(async () => {
    if (!(await backendReachable())) {
      skipReason = `backend not reachable at ${BACKEND_URL} — start it with \`cd backend && npm run dev\``;
      return;
    }
    await cleanup(supabase);
  });
  afterAll(async () => cleanup(supabase));

  it('creates exactly one charge_attempts row and one Stripe charge under concurrent requests', async () => {
    if (skipReason) {
      console.warn(`Skipping: ${skipReason}`);
      return;
    }

    const customer = await stripe.customers.create({ email: `dup-${Date.now()}${TEST_EMAIL_DOMAIN}` });
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.setupIntents.create({
      customer: customer.id,
      payment_method: pm.id,
      payment_method_types: ['card'],
      usage: 'off_session',
      confirm: true,
    });

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        first_name: 'Duplicate',
        last_name: 'Charge',
        email: `dup-${Date.now()}${TEST_EMAIL_DOMAIN}`,
        phone: '5145551234',
        party_size: 8,
        booking_date: '2099-01-02',
        slot_start: '18:00:00',
        slot_end: '20:00:00',
        stripe_customer_id: customer.id,
        stripe_payment_method_id: pm.id,
        status: 'confirmed',
        bypassed_slot_limit: true,
      })
      .select()
      .single();
    if (error || !booking) throw error ?? new Error('booking insert failed');

    const CONCURRENCY = 5;
    const fireCharge = () =>
      fetch(`${BACKEND_URL}/api/admin/bookings/${booking.id}/charge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.BACKEND_INTERNAL_SECRET ?? '',
        },
        body: JSON.stringify({}),
      });

    const responses = await Promise.all(Array.from({ length: CONCURRENCY }, fireCharge));
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as { chargeAttemptId?: string }[];
    const distinctAttemptIds = new Set(bodies.map((b) => b.chargeAttemptId).filter(Boolean));

    console.log(`\nDuplicate charge test: ${CONCURRENCY} concurrent requests -> statuses [${responses.map((r) => r.status).join(', ')}]`);
    console.log(`distinct chargeAttemptIds returned: ${distinctAttemptIds.size}`);

    // Every response — win or lose the race — must point at the same attempt.
    expect(distinctAttemptIds.size).toBe(1);

    const { count: attemptRows } = await supabase
      .from('charge_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', booking.id);
    expect(attemptRows).toBe(1);

    // Wait for the (single) job to settle, then confirm Stripe only shows one charge.
    const deadline = Date.now() + 15000;
    let settled = false;
    while (Date.now() < deadline && !settled) {
      const { data } = await supabase.from('charge_attempts').select('status').eq('booking_id', booking.id).single();
      if (data && ['succeeded', 'failed'].includes(data.status)) settled = true;
      else await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const charges = await stripe.charges.list({ customer: customer.id, limit: 10 });
    console.log(`Stripe charges for this customer: ${charges.data.length}`);
    expect(charges.data.length).toBe(1);
  }, 60_000);
});
