-- Stripe webhook event log.
--
-- The existing webhook handler (src/app/api/stripe/webhook/route.ts) only console.error()s
-- on payment_intent.payment_failed and charge.dispute.created -- nothing is persisted, so a
-- failed no-show charge or a dispute is invisible outside the Stripe dashboard. This table
-- gives the backend a durable, idempotent record of every event it receives.
--
-- Idempotency: `id` is Stripe's event.id. `insert ... on conflict (id) do nothing` returning
-- a 0 row count means "already seen" -- Stripe redelivers events, and this is the only guard
-- needed against processing one twice.

CREATE TABLE stripe_webhook_events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  process_error TEXT
);

CREATE INDEX idx_stripe_webhook_events_type_received
  ON stripe_webhook_events (type, received_at DESC);

-- Unprocessed/failed events are what the admin "webhook health" endpoint queries for.
CREATE INDEX idx_stripe_webhook_events_unprocessed
  ON stripe_webhook_events (received_at)
  WHERE processed_at IS NULL;

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Same pattern as bookings (001_create_bookings.sql): only the backend's service_role
-- client ever touches this table. No anon policy is created at all.
CREATE POLICY "Service role has full access" ON stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE stripe_webhook_events IS 'Durable, idempotent log of every Stripe webhook event received by the backend.';
COMMENT ON COLUMN stripe_webhook_events.id IS 'Stripe event.id -- primary key doubles as the idempotency key.';
