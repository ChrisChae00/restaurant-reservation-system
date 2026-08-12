// Guards every /api/admin/* route. The only caller is the Next.js app's charge-penalty
// proxy route (src/app/api/admin/charge-penalty/route.ts), which already ran requireAuth()
// against the admin's session before reaching here — this is a service-to-service secret,
// not a second user-facing auth layer.
import { createHash, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';

// timingSafeEqual requires equal-length buffers and throws otherwise. Comparing lengths
// first and bailing out would itself leak timing (an attacker learns the secret's length
// one guess at a time), so both inputs are hashed to a fixed 32-byte digest first — the
// digest comparison is safe regardless of how the original strings' lengths differ.
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const provided = req.header('x-internal-secret');
  if (!provided || !safeEqual(provided, env.BACKEND_INTERNAL_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
