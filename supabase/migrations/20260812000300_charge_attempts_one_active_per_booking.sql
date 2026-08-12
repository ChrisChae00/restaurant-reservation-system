-- Closes a race the UNIQUE(idempotency_key) constraint doesn't cover: idempotency_key is
-- `noshow-{bookingId}-{amountCents}`, so two concurrent POST /bookings/:id/charge requests
-- for the SAME booking but DIFFERENT amounts (e.g. two admins, or a double-click that races
-- a guest-count edit) produce two different keys, both pass the UNIQUE check, and both
-- pass the route's booking.status !== 'noshow_charged' guard (a plain read before either
-- write lands) -- resulting in two charge_attempts rows and two real Stripe charges.
--
-- A partial unique index on booking_id, excluding 'failed', means at most one row can be
-- queued/processing/succeeded/requires_action/disputed/refunded for a given booking at a
-- time. 'failed' is excluded because that's the one status the app deliberately allows a
-- fresh attempt after (see backend/src/routes/admin.ts's manual-retry branch) -- a booking
-- can accumulate any number of 'failed' rows, but never more than one row that is still
-- active or already resolved.

CREATE UNIQUE INDEX idx_charge_attempts_one_active_per_booking
  ON charge_attempts (booking_id)
  WHERE status != 'failed';

COMMENT ON INDEX idx_charge_attempts_one_active_per_booking IS
  'At most one non-failed charge_attempts row per booking -- second line of defense against a race between two differently-amounted concurrent charge requests for the same booking.';
