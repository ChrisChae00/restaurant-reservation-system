-- Group Reservation System Database Schema
-- Migration: 001_create_bookings (Updated for 7-14 person groups)

-- Drop existing types/tables if they exist
DROP TABLE IF EXISTS bookings;
DROP TYPE IF EXISTS booking_status;

-- Create booking status enum
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'completed', 'noshow_charged');

-- Create bookings table
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Customer Information (separate first/last name)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  
  -- Booking Details (7-14 people only)
  party_size INTEGER NOT NULL CHECK (party_size >= 7 AND party_size <= 14),
  booking_date DATE NOT NULL,
  slot_start TIME NOT NULL,
  slot_end TIME NOT NULL,
  
  -- Additional Info
  allergy_info TEXT,  -- NULL if no allergies, text description if yes
  accepted_menu_policy BOOLEAN DEFAULT TRUE,
  accepted_house_rules BOOLEAN DEFAULT TRUE,
  special_notes TEXT,
  
  -- Stripe Integration (CRITICAL for off-session charging)
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,
  
  -- Status & Penalty Tracking
  status booking_status DEFAULT 'confirmed',
  penalty_charged_at TIMESTAMPTZ,
  penalty_amount INTEGER,  -- in cents (e.g., 2000 = $20.00)
  penalty_payment_intent_id TEXT,
  
  -- Constraints
  CONSTRAINT valid_time_range CHECK (slot_start < slot_end OR slot_end = '00:00:00')
);

-- Indexes for efficient querying
CREATE INDEX idx_bookings_date_slot ON bookings (booking_date, slot_start, slot_end);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_email ON bookings (email);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
CREATE POLICY "Service role has full access" ON bookings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anonymous inserts (for public booking form)
CREATE POLICY "Allow anonymous inserts" ON bookings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Allow reading (for admin queries via service role)
CREATE POLICY "Allow reading" ON bookings
  FOR SELECT
  TO anon
  USING (true);

-- Comments for documentation
COMMENT ON TABLE bookings IS 'Group reservations (7-14 people) with Stripe card on file for no-show penalty';
COMMENT ON COLUMN bookings.stripe_payment_method_id IS 'Stripe PaymentMethod ID for off-session no-show charging';
COMMENT ON COLUMN bookings.penalty_amount IS 'Amount charged for no-show in cents ($20 per person)';
