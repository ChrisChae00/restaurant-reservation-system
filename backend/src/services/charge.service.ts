import type { ChargeFailureClass } from '../types.js';

const INSUFFICIENT_FUNDS_DECLINE_CODES = new Set(['insufficient_funds', 'try_again_later']);

const TRANSIENT_STRIPE_TYPES = new Set<string>([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
]);

/**
 * Duck-typed shape of a thrown Stripe error, checked structurally rather than with
 * `instanceof Stripe.errors.StripeError`. Root (CJS, no "type":"module") and this backend
 * ("type":"module") resolve the `stripe` package's conditional exports to two different
 * files — esm/stripe.esm.node.js vs cjs/stripe.cjs.node.js — so an error thrown by
 * chargeNoShowFee() (in root's src/lib/stripe.ts) is a StripeCardError from the *other*
 * build's class, and `instanceof` against this build's class silently returns false even
 * though the object's shape is identical. Duck-typing sidesteps module identity entirely.
 */
interface StripeErrorShape {
  type: string;
  code?: string;
  decline_code?: string;
  message?: string;
}

function asStripeError(error: unknown): StripeErrorShape | null {
  if (
    error &&
    typeof error === 'object' &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string' &&
    (error as { type: string }).type.startsWith('Stripe')
  ) {
    return error as StripeErrorShape;
  }
  return null;
}

/**
 * Classify a failed Stripe charge to decide whether retrying is worth it.
 *
 * ponytail: classification is string matching on Stripe's documented error/decline codes.
 * Stripe adding a new code falls through to 'permanent' (the default below) — recharging a
 * card on an error we don't recognize is worse than making an admin retry manually.
 */
export function classifyChargeFailure(error: unknown): ChargeFailureClass {
  const stripeError = asStripeError(error);
  if (stripeError) {
    if (TRANSIENT_STRIPE_TYPES.has(stripeError.type)) {
      return 'transient';
    }

    if (stripeError.type === 'StripeCardError') {
      if (stripeError.decline_code && INSUFFICIENT_FUNDS_DECLINE_CODES.has(stripeError.decline_code)) {
        return 'insufficient_funds';
      }
      return 'permanent'; // expired_card, incorrect_cvc, generic_decline, etc.
    }
  }

  // Network errors thrown by the Stripe SDK before it constructs a StripeError (e.g. a
  // raw ECONNRESET) are also transient — the request never reached Stripe.
  if (error instanceof Error && /ECONNRESET|ETIMEDOUT|ENOTFOUND/.test(error.message)) {
    return 'transient';
  }

  return 'permanent';
}

export function stripeErrorCode(error: unknown): string | null {
  const stripeError = asStripeError(error);
  if (!stripeError) return null;
  return stripeError.code ?? stripeError.type;
}

export function stripeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
