// Stripe Configuration
import Stripe from 'stripe';

// Lazy initialization to avoid build-time errors when env vars are missing
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-11-17.clover',
      typescript: true,
    });
  }
  return stripeInstance;
}

// Constants
export const CURRENCY = 'cad';
export const NO_SHOW_FEE_PER_PERSON = 2000; // $20.00 CAD in cents

/**
 * Create a SetupIntent for saving card details
 * No immediate charge - card is saved for potential no-show fees
 */
export async function createSetupIntent(
  customerEmail: string,
  customerName: string,
  metadata?: Record<string, string>
): Promise<Stripe.SetupIntent> {
  const stripe = getStripe();
  
  // First, find or create a customer
  const customers = await stripe.customers.list({
    email: customerEmail,
    limit: 1,
  });

  let customer: Stripe.Customer;

  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName,
      metadata: {
        source: 'restaurant_reservation',
      },
    });
  }

  // Create SetupIntent
  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id,
    payment_method_types: ['card'],
    usage: 'off_session', // Allow charging later without customer present
    metadata: {
      ...metadata,
      customer_email: customerEmail,
    },
  });

  return setupIntent;
}

/**
 * Verify a webhook request's Stripe-Signature header against the raw request body.
 * Throws if the signature is missing, malformed, or does not match — callers should treat
 * that as a 400, never process the payload, and never fall back to trusting it unverified.
 */
export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export type VerifiedCard = {
  customerId: string;
  paymentMethodId: string;
};

/**
 * Resolve the saved card behind a SetupIntent, confirming with Stripe that the setup
 * actually succeeded.
 *
 * The customer and payment-method IDs must come from here rather than from the booking
 * request: a caller who supplied them directly could point a booking at another guest's
 * stored card and have that person charged for the no-show.
 *
 * Returns null when the SetupIntent does not exist, has not succeeded, or is missing the
 * customer/payment-method links.
 */
export async function verifySetupIntent(
  setupIntentId: string
): Promise<VerifiedCard | null> {
  const stripe = getStripe();

  let setupIntent: Stripe.SetupIntent;
  try {
    setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  } catch (error) {
    console.error('Failed to retrieve SetupIntent:', setupIntentId, error);
    return null;
  }

  if (setupIntent.status !== 'succeeded') {
    console.error('SetupIntent is not in a succeeded state:', setupIntentId, setupIntent.status);
    return null;
  }

  const customerId = typeof setupIntent.customer === 'string'
    ? setupIntent.customer
    : setupIntent.customer?.id;
  const paymentMethodId = typeof setupIntent.payment_method === 'string'
    ? setupIntent.payment_method
    : setupIntent.payment_method?.id;

  if (!customerId || !paymentMethodId) {
    console.error('SetupIntent is missing customer or payment method:', setupIntentId);
    return null;
  }

  return { customerId, paymentMethodId };
}

/**
 * Charge a no-show fee using the saved payment method
 * If customAmountCents is provided, use that instead of calculating from partySize
 */
export async function chargeNoShowFee(
  customerId: string,
  paymentMethodId: string,
  partySize: number,
  bookingId: string,
  customAmountCents?: number,
  idempotencySuffix?: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const amount = customAmountCents ?? (NO_SHOW_FEE_PER_PERSON * partySize);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: CURRENCY,
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: customAmountCents
        ? `No-show fee for booking ${bookingId} (custom amount)`
        : `No-show fee for booking ${bookingId} (${partySize} guests)`,
      metadata: {
        booking_id: bookingId,
        party_size: partySize.toString(),
        fee_type: 'no_show',
        custom_amount: customAmountCents ? 'true' : 'false',
      },
    },
    {
      // A retry, a double-click, or a second attempt after a failed status write returns
      // the original PaymentIntent instead of charging the guest again. The amount is part
      // of the key so a deliberate re-charge at a different amount is still possible.
      //
      // idempotencySuffix (the queued backend's charge worker passes its attempt number)
      // is what makes a genuine automatic retry actually re-attempt the charge instead of
      // Stripe replaying the first attempt's response for 24h. Callers that never retry
      // (this file's only other caller, the synchronous admin route) omit it and keep the
      // original key unchanged.
      idempotencyKey: idempotencySuffix ? `noshow-${bookingId}-${amount}-${idempotencySuffix}` : `noshow-${bookingId}-${amount}`,
    }
  );

  return paymentIntent;
}
