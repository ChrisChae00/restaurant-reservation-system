
-- Add accepted_cancellation_policy column to bookings table
ALTER TABLE bookings 
ADD COLUMN accepted_cancellation_policy BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN bookings.accepted_cancellation_policy IS 'Whether the user explicitly accepted the cancellation policy/no-show fee';
