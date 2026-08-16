import express from 'express';

// Stripe's signature verification (verifyWebhookSignature in src/lib/stripe.ts) needs the
// exact raw request bytes — JSON.stringify(req.body) would not byte-for-byte match what
// Stripe signed. Mounted only on the webhook route; every other route uses express.json().
export const rawBody = express.raw({ type: 'application/json' });
