-- Admins need to be able to raise a booking's party size beyond the public
-- 7-14 range (e.g. a guest calls in after booking and says their group grew
-- to 20). The public booking flow still enforces 7-14 via zod in
-- src/lib/validations.ts, so this only relaxes what the database allows.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_party_size_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_party_size_check CHECK (party_size >= 1);
