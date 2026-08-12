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
  insufficientFunds: [24 * 60 * 60_000], // 24h, repeated up to 2 attempts by the worker
} as const;
