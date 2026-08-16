import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';
import type { ChargeJobData, EmailJobData } from './types.js';

// maxRetriesPerRequest: null is required by BullMQ's blocking connection usage.
export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const chargeQueue = new Queue<ChargeJobData>('charge', { connection });
export const emailQueue = new Queue<EmailJobData>('email', { connection });

// Delays used by the charge worker's failure-classification retry policy
// (see services/charge.service.ts classifyChargeFailure).
export const RETRY_DELAYS_MS = {
  transient: [60_000, 5 * 60_000, 60 * 60_000], // 1m, 5m, 1h
  // 25h, not 24h: a charge_attempts row reuses one Stripe idempotency key for every retry
  // (see charge.worker.ts), and Stripe retains a key's saved response for at least 24h.
  // This is the one retry that must produce a genuinely new charge rather than a replayed
  // decline, so it waits until the key has definitely been pruned. One retry, two attempts.
  insufficientFunds: [25 * 60 * 60_000],
} as const;
