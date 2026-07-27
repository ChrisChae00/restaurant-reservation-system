-- Tracks failed admin login attempts so the login route can rate-limit brute-force
-- attempts. Only failures are recorded; a successful login never inserts a row.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- client IP (or "unknown" if not resolvable)
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_identifier_time
  ON admin_login_attempts (identifier, attempted_at);

-- The service-role key (used server-side only) bypasses RLS, but enabling it keeps this
-- table from being reachable by the anon key if it were ever queried directly.
ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
