-- Track email delivery failures on a booking so staff can see, from the admin dashboard,
-- when a guest may not have received a confirmation/cancellation/receipt/no-show email
-- instead of the failure being visible only in server logs.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS last_email_error TEXT,
  ADD COLUMN IF NOT EXISTS last_email_error_at TIMESTAMPTZ;
