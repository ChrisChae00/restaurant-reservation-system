-- Remove anonymous access to the bookings table.
--
-- The `anon` role's key ships to browsers (NEXT_PUBLIC_SUPABASE_ANON_KEY), so these
-- two policies allowed anyone to read every reservation -- including customer PII
-- (name, email, phone, allergy notes) and the Stripe customer/payment-method IDs used
-- for off-session no-show charges -- and to insert rows directly, bypassing the API's
-- availability, validation, and Stripe checks entirely.
--
-- Nothing in the application relies on them: every route reaches the database through
-- createServerClient() (SUPABASE_SERVICE_ROLE_KEY), and the service role bypasses RLS.
-- createAnonClient() exists in src/lib/supabase/server.ts but has no callers.

DROP POLICY IF EXISTS "Allow anonymous inserts" ON bookings;
DROP POLICY IF EXISTS "Allow reading" ON bookings;

-- The "Service role has full access" policy from 001_create_bookings.sql remains and is
-- the only policy on this table. RLS stays enabled, so the anon role now has no access.
