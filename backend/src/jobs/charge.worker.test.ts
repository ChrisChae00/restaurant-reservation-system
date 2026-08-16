// Regression tests for the duplicate-charge bug: the worker used to derive the Stripe
// idempotency key from the attempt *number*, so every retry and every recovery of a stuck
// row sent Stripe a brand-new key. A run that charged the card but never recorded the
// outcome (worker crash before the status write, or a connection error after Stripe
// accepted the request) therefore charged the guest a second time.
//
// The invariant these tests pin down: one charge_attempts row uses exactly one Stripe
// idempotency key — its own — no matter how many times its job runs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { ChargeAttempt, ChargeJobData } from '../types.js';

const chargeNoShowFee = vi.fn();
const updateChargeAttempt = vi.fn();
const bookingUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

let attemptRow: ChargeAttempt;

const booking = {
  id: 'booking-1',
  email: 'guest@example.com',
  email_language: 'en',
  booking_reference: 'LUNA-1',
  stripe_customer_id: 'cus_1',
  stripe_payment_method_id: 'pm_1',
};

vi.mock('@/lib/stripe', () => ({ chargeNoShowFee: (...args: unknown[]) => chargeNoShowFee(...args) }));

// queue.js opens a real Redis connection at import time; notify.service.js pulls in env.js
// and its full secret validation. Neither is what these tests are about.
vi.mock('../queue.js', () => ({
  connection: {},
  chargeQueue: { add: vi.fn() },
  RETRY_DELAYS_MS: { transient: [1000], insufficientFunds: [2000] },
}));
vi.mock('../services/notify.service.js', () => ({
  queueEmail: vi.fn(),
  queueChargeFailedAdminAlert: vi.fn(),
}));
vi.mock('../db.js', () => ({
  db: () => ({
    from: (table: string) =>
      table === 'bookings'
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: booking, error: null }) }) }), update: bookingUpdate }
        : { select: () => ({ eq: () => ({ single: async () => ({ data: attemptRow, error: null }) }) }) },
  }),
  updateChargeAttempt: (...args: unknown[]) => updateChargeAttempt(...args),
}));

const { processChargeJob } = await import('./charge.worker.js');

function makeAttempt(overrides: Partial<ChargeAttempt> = {}): ChargeAttempt {
  return {
    id: 'attempt-1',
    booking_id: 'booking-1',
    idempotency_key: 'noshow-booking-1-14000',
    amount_cents: 14000,
    guest_count: 7,
    status: 'queued',
    attempt_count: 0,
    payment_intent_id: null,
    stripe_error_code: null,
    stripe_error_message: null,
    triggered_by: 'admin',
    created_at: '2026-08-15T00:00:00Z',
    updated_at: '2026-08-15T00:00:00Z',
    ...overrides,
  };
}

const job = { data: { chargeAttemptId: 'attempt-1', bookingId: 'booking-1' } } as Job<ChargeJobData>;

// The 6th argument of chargeNoShowFee is the Stripe idempotency key override.
const keyUsed = () => chargeNoShowFee.mock.calls.at(-1)?.[5];

beforeEach(() => {
  vi.clearAllMocks();
  chargeNoShowFee.mockResolvedValue({ id: 'pi_1', status: 'succeeded', amount: 14000 });
});

describe('processChargeJob idempotency key', () => {
  it('charges with the attempt row\'s own idempotency key on the first run', async () => {
    attemptRow = makeAttempt();
    await processChargeJob(job);
    expect(keyUsed()).toBe('noshow-booking-1-14000');
  });

  it('reuses the same key when recovering a row stuck in processing', async () => {
    // The crashed run already bumped attempt_count to 1. A per-attempt key would send
    // Stripe `...-2` here and create a second PaymentIntent for a card that may already
    // have been charged.
    attemptRow = makeAttempt({ status: 'processing', attempt_count: 1 });
    await processChargeJob(job);
    expect(keyUsed()).toBe('noshow-booking-1-14000');
  });

  it('reuses the same key across successive retries of a failed row', async () => {
    attemptRow = makeAttempt({ status: 'failed', attempt_count: 1 });
    await processChargeJob(job);
    const first = keyUsed();

    attemptRow = makeAttempt({ status: 'failed', attempt_count: 2 });
    await processChargeJob(job);

    expect(keyUsed()).toBe(first);
  });

  it('uses the distinct key of a manual-retry row, so a deliberate re-charge still goes through', async () => {
    attemptRow = makeAttempt({ idempotency_key: 'noshow-booking-1-14000-manual1' });
    await processChargeJob(job);
    expect(keyUsed()).toBe('noshow-booking-1-14000-manual1');
  });

  it('does not call Stripe at all for an already-succeeded row', async () => {
    attemptRow = makeAttempt({ status: 'succeeded', attempt_count: 1, payment_intent_id: 'pi_1' });
    await processChargeJob(job);
    expect(chargeNoShowFee).not.toHaveBeenCalled();
  });
});
