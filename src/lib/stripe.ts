// Stripe Configuration
import Stripe from 'stripe';

// Lazy initialization to avoid build-time errors when env vars are missing
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
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
 * Retrieve a SetupIntent by ID
 */
export async function getSetupIntent(
  setupIntentId: string
): Promise<Stripe.SetupIntent> {
  const stripe = getStripe();
  return stripe.setupIntents.retrieve(setupIntentId);
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
  customAmountCents?: number
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const amount = customAmountCents ?? (NO_SHOW_FEE_PER_PERSON * partySize);

  const paymentIntent = await stripe.paymentIntents.create({
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
  });

  return paymentIntent;
}
