-- Add 'pending' status to booking_status enum
-- Migration: 002_add_pending_status
-- 
-- ⚠️ IMPORTANT: Run these two statements SEPARATELY in Supabase SQL Editor
-- PostgreSQL requires a commit between adding enum value and using it
--

-- STEP 1: First, run this command alone and click "Run"
ALTER TYPE booking_status ADD VALUE 'pending' BEFORE 'confirmed';

-- STEP 2: After STEP 1 completes, run this command separately
 ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';

-- Add comment for documentation
 COMMENT ON COLUMN bookings.status IS 'Booking status: pending (awaiting manager confirmation), confirmed, cancelled, completed, noshow_charged';
