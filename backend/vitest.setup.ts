import { config } from 'dotenv';

// Loads from the repo root's .env.local (shared with the Next.js app) so integration tests
// that need SUPABASE_SERVICE_ROLE_KEY / STRIPE_TEST_SECRET_KEY find them without a second
// copy of the same secrets in backend/.env.
config({ path: '../.env.local' });
