-- No-show charge attempt history.
--
-- Today, POST /api/admin/charge-penalty makes exactly one synchronous attempt at an
-- off-session Stripe charge (src/app/api/admin/charge-penalty/route.ts:81) with no record
-- kept beyond the booking row itself -- so charge success rate, failure reasons, and retry
-- counts are all unanswerable questions. This table is that history, and it is what the
-- queued backend pipeline appends to on every attempt.
--
-- idempotency_key mirrors the key already sent to Stripe by chargeNoShowFee()
-- (src/lib/stripe.ts:168, 'noshow-{bookingId}-{amountCents}'). The UNIQUE constraint here is
-- a second, independent line of defense against a duplicate charge: Stripe's idempotency
-- only protects a given (key, request body) pair, so if two processes ever raced to insert
-- the same key, only one row -- and one BullMQ job -- can exist.

CREATE TABLE charge_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  idempotency_key       TEXT NOT NULL UNIQUE,
  amount_cents          INTEGER NOT NULL,
  guest_count           INTEGER NOT NULL,
  status                TEXT NOT NULL CHECK (status IN (
                            'queued', 'processing', 'succeeded', 'failed',
                            'requires_action', 'disputed', 'refunded'
                          )),
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  payment_intent_id     TEXT,
  stripe_error_code     TEXT,
  stripe_error_message  TEXT,
  triggered_by          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charge_attempts_booking_id ON charge_attempts (booking_id);

-- The "stuck job recovery" scheduled job (backend/src/jobs/scheduler.ts) scans exactly this
-- set: attempts sitting in queued/processing/failed.
CREATE INDEX idx_charge_attempts_active_status
  ON charge_attempts (status)
  WHERE status IN ('queued', 'processing', 'failed');

CREATE TRIGGER update_charge_attempts_updated_at
  BEFORE UPDATE ON charge_attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE charge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON charge_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE charge_attempts IS 'History of every no-show charge attempt, one row per idempotency key.';
COMMENT ON COLUMN charge_attempts.idempotency_key IS 'Matches the key sent to Stripe (see src/lib/stripe.ts chargeNoShowFee). UNIQUE is the DB-side duplicate-charge guard.';
