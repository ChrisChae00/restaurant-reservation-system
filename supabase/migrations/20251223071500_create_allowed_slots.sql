-- Migration: Create allowed_slots table
-- Purpose: Store slots that admin allows for additional bookings even if already booked

CREATE TABLE IF NOT EXISTS allowed_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  slot_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, slot_id)
);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_allowed_slots_date_slot ON allowed_slots(date, slot_id);

-- Enable RLS
ALTER TABLE allowed_slots ENABLE ROW LEVEL SECURITY;

-- Policy: Admin can manage
CREATE POLICY "Admin can manage allowed slots"
ON allowed_slots
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Public can read (for availability API)
CREATE POLICY "Public can read allowed slots"
ON allowed_slots
FOR SELECT
TO anon
USING (true);
