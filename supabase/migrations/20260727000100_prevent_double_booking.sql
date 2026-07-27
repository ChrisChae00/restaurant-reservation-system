-- Enforce "one team per slot" in the database instead of only in application code.
--
-- src/app/api/bookings/route.ts checked availability with a SELECT and then INSERTed as a
-- separate statement. Two requests for the same slot arriving inside that window both saw
-- the slot as free and both succeeded, producing two confirmed reservations for the same
-- date and time. No transaction, lock, or constraint spanned the two statements, so the
-- guarantee could only ever hold in the database.
--
-- The admin "추가 예약 허용" (allowed_slots) override deliberately permits a second party in
-- an already-booked slot, so a plain unique index would break that feature. Bookings created
-- under an override are tagged with bypassed_slot_limit = true and excluded from the index;
-- ordinary bookings remain strictly one-per-slot.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS bypassed_slot_limit BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.bypassed_slot_limit IS
  'True when this booking was accepted under an admin allowed_slots override, which exempts it from the one-team-per-slot unique index.';

-- Existing rows may already contain duplicates (from past overrides, or from the race this
-- migration closes). Tag all but the earliest booking in each slot as an override so the
-- unique index can be created without deleting or rejecting live reservations.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY booking_date, slot_start, slot_end
      ORDER BY created_at, id
    ) AS position
  FROM bookings
  WHERE status IN ('pending', 'confirmed', 'completed')
)
UPDATE bookings
SET bypassed_slot_limit = true
FROM ranked
WHERE bookings.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_one_team_per_slot
  ON bookings (booking_date, slot_start, slot_end)
  WHERE status IN ('pending', 'confirmed', 'completed')
    AND bypassed_slot_limit = false;
