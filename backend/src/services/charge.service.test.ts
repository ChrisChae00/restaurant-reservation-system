import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { classifyChargeFailure, stripeErrorCode } from './charge.service.js';

// Plain objects shaped like Stripe SDK errors, not real `stripe` package error classes.
// classifyChargeFailure() duck-types on `.type`/`.decline_code` rather than instanceof —
// see the comment in charge.service.ts for why (root and this backend load different
// CJS/ESM builds of the `stripe` package, so a real instanceof check silently fails across
// that boundary even for objects with an identical shape). These fixtures exercise exactly
// the properties the classifier reads, independent of which Stripe build produced them.
function cardError(declineCode: string | undefined) {
  return {
    type: 'StripeCardError',
    code: 'card_declined',
    decline_code: declineCode,
    message: 'Your card was declined.',
  };
}

function connectionError() {
  return {
    type: 'StripeConnectionError',
    message: 'Connection failed',
  };
}

describe('classifyChargeFailure', () => {
  it('classifies insufficient_funds decline codes as insufficient_funds', () => {
    expect(classifyChargeFailure(cardError('insufficient_funds'))).toBe('insufficient_funds');
  });

  it('classifies try_again_later decline codes as insufficient_funds', () => {
    expect(classifyChargeFailure(cardError('try_again_later'))).toBe('insufficient_funds');
  });

  it('classifies a generic decline as permanent', () => {
    expect(classifyChargeFailure(cardError('generic_decline'))).toBe('permanent');
  });

  it('classifies an expired card as permanent', () => {
    expect(classifyChargeFailure(cardError(undefined))).toBe('permanent');
  });

  it('classifies a Stripe connection error as transient', () => {
    expect(classifyChargeFailure(connectionError())).toBe('transient');
  });

  it('classifies an unrecognized error as permanent (safe default: no auto-retry)', () => {
    expect(classifyChargeFailure(new Error('something unexpected'))).toBe('permanent');
  });

  it('classifies a raw network error message as transient', () => {
    expect(classifyChargeFailure(new Error('connect ECONNRESET'))).toBe('transient');
  });

  // Regression test for a real bug: an earlier version of stripeErrorCode/classifyChargeFailure
  // used `instanceof Stripe.errors.StripeError`, which returned false for every error thrown
  // by root's src/lib/stripe.ts (a different `stripe` package build — see the module-identity
  // comment in charge.service.ts) and silently classified every charge failure as 'permanent'
  // with a null error code. Constructing a real error via this backend's own `stripe` import
  // doesn't reproduce the cross-build gap, but it does prove duck-typing still classifies a
  // genuine SDK error instance correctly, not just plain fixture objects.
  it('classifies a real Stripe.errors.StripeCardError instance via duck-typing, not instanceof', () => {
    const err = new Stripe.errors.StripeCardError({
      type: 'card_error',
      code: 'card_declined',
      decline_code: 'insufficient_funds',
      message: 'Your card has insufficient funds.',
    } as unknown as Stripe.StripeRawError);

    expect(classifyChargeFailure(err)).toBe('insufficient_funds');
    expect(stripeErrorCode(err)).toBe('card_declined');
  });
});
