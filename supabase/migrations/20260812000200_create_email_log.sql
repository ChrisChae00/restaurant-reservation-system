-- Outbound email log.
--
-- Today only a failed *guest* email leaves a trace, and only the most recent one, on the
-- booking row itself (last_email_error / last_email_error_at, added in
-- 20260728000000_add_email_failure_tracking.sql). Manager-notification failures leave no
-- trace at all (see note.txt, issue 2). This table gives every send attempt -- guest and
-- admin, success and failure -- a durable record independent of the booking row.

CREATE TABLE email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID REFERENCES bookings(id) ON DELETE SET NULL,
  template      TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  locale        TEXT,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  message_id    TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);

CREATE INDEX idx_email_log_booking_created ON email_log (booking_id, created_at DESC);

CREATE INDEX idx_email_log_failed
  ON email_log (created_at)
  WHERE status = 'failed';

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON email_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE email_log IS 'Record of every email the backend queues, guest and admin, success and failure.';
