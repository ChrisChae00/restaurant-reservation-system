-- Migration: Add booking_reference column
-- Purpose: Store user-friendly 6-digit booking reference (MMDDNN format)
-- Example: 123101 = December 31, booking #01

-- Add booking_reference column
ALTER TABLE bookings ADD COLUMN booking_reference TEXT;

-- Create unique index
CREATE UNIQUE INDEX idx_bookings_reference ON bookings(booking_reference);

-- For existing bookings, generate reference from booking_date + sequence
-- This uses the format: MMDDNN where MM=month, DD=day, NN=sequence
DO $$
DECLARE
  rec RECORD;
  seq_num INTEGER;
  date_prefix TEXT;
  new_ref TEXT;
BEGIN
  FOR rec IN 
    SELECT id, booking_date, 
           ROW_NUMBER() OVER (PARTITION BY booking_date ORDER BY created_at) as seq
    FROM bookings 
    WHERE booking_reference IS NULL
    ORDER BY booking_date, created_at
  LOOP
    date_prefix := TO_CHAR(rec.booking_date, 'MMDD');
    new_ref := date_prefix || LPAD(rec.seq::text, 2, '0');
    
    UPDATE bookings SET booking_reference = new_ref WHERE id = rec.id;
  END LOOP;
END $$;

-- Now make it NOT NULL for future inserts
-- Note: This is commented out to avoid issues if there are no existing bookings
-- ALTER TABLE bookings ALTER COLUMN booking_reference SET NOT NULL;

COMMENT ON COLUMN bookings.booking_reference IS 'User-friendly 6-digit booking reference in MMDDNN format (e.g., 123101 = Dec 31, booking #1)';
