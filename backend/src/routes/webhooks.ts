// POST /api/webhooks/stripe
//
// Registered as an additional Stripe endpoint alongside the existing Next.js one
// (src/app/api/stripe/webhook/route.ts, which keeps running unchanged — Stripe fans an
// event out to every registered endpoint, so this can go live with zero cutover risk).
//
// Response and processing are deliberately split: Stripe needs a fast 200 to avoid
// redelivery storms, so this handler only verifies the signature, records the event
// idempotently, and enqueues the real work. The worker (jobs/webhook.worker.ts) does the
// DB/email side effects and can retry independently of Stripe's redelivery schedule.
import { Router } from 'express';
import type Stripe from 'stripe';
import { verifyWebhookSignature } from '@/lib/stripe';
import { rawBody } from '../middleware/raw-body.js';
import { recordWebhookEvent } from '../db.js';
import { WEBHOOK_JOB_OPTS, webhookQueue } from '../jobs/webhook.worker.js';
import { logger } from '../logger.js';

export const webhooksRouter = Router();

webhooksRouter.post('/stripe', rawBody, async (req, res) => {
  const signature = req.header('stripe-signature');
  if (!signature) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(req.body.toString('utf8'), signature);
  } catch (error) {
    logger.warn({ error }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const { created } = await recordWebhookEvent({
      id: event.id,
      type: event.type,
      payload: event as unknown,
    });

    if (created) {
      await webhookQueue.add(event.type, { eventId: event.id }, { jobId: event.id, ...WEBHOOK_JOB_OPTS });
    }
    // created: false means Stripe redelivered an event already logged — ack without
    // re-enqueueing so it isn't processed twice.
  } catch (error) {
    // Recording/enqueueing failed on our side, not a signature problem. Returning a
    // non-2xx here makes Stripe retry delivery, which is exactly what should happen.
    logger.error({ error, eventId: event.id }, 'Failed to record Stripe webhook event');
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  res.status(200).json({ received: true });
});
