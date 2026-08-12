// Environment variable validation. Fails fast at startup rather than letting a missing
// secret surface later as a cryptic Stripe/Supabase error mid-request.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),

  // Named to match createServerClient() in src/lib/supabase/server.ts, which this backend
  // reuses as-is — that function reads NEXT_PUBLIC_SUPABASE_URL regardless of caller.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  GMAIL_USER: z.string().min(1),
  GMAIL_APP_PASSWORD: z.string().min(1),
  // z.coerce.boolean() reads any non-empty string as true, so DISABLE_EMAIL_SENDING=false
  // in a real .env would silently disable every admin alert. Only the literal string
  // 'true' opts in.
  DISABLE_EMAIL_SENDING: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  BACKEND_INTERNAL_SECRET: z.string().min(16, 'must be at least 16 characters'),

  ADMIN_ALERT_EMAIL: z.string().email(),

  TZ: z.string().default('America/Toronto'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
