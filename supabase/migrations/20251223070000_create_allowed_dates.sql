-- Migration: Create allowed_dates table
-- Purpose: Store dates within the 7-day window that admin explicitly allows for booking

CREATE TABLE IF NOT EXISTS allowed_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_allowed_dates_date ON allowed_dates(date);

-- Enable RLS (Row Level Security)
ALTER TABLE allowed_dates ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users (admin) to manage allowed dates
CREATE POLICY "Admin can manage allowed dates"
ON allowed_dates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow public reads (for availability API)
CREATE POLICY "Public can read allowed dates"
ON allowed_dates
FOR SELECT
TO anon
USING (true);
