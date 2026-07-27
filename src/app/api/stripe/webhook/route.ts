// API Route: Stripe Webhook
// POST /api/stripe/webhook
//
// This does not participate in the booking flow — the booking and no-show-charge routes
// already verify SetupIntents/PaymentIntents synchronously and never trust unverified
// client input. This endpoint's job is to catch what only Stripe can tell us *after* the
// fact: an off-session no-show charge that failed, or a guest disputing a charge with their
// bank. Both were previously invisible outside of manually checking the Stripe dashboard.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe, verifyWebhookSignature } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(payload, signature);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        console.error(
          'Stripe no-show charge failed after the fact:',
          'bookingId:', intent.metadata?.booking_id,
          'paymentIntentId:', intent.id,
          'error:', intent.last_payment_error?.message
        );
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const stripe = getStripe();
        const charge = await stripe.charges.retrieve(dispute.charge as string);
        console.error(
          'Stripe dispute opened against a charge:',
          'bookingId:', charge.metadata?.booking_id,
          'disputeId:', dispute.id,
          'amount:', dispute.amount,
          'reason:', dispute.reason,
          'chargeId:', charge.id
        );
        break;
      }

      default:
        // Unhandled event types are expected — Stripe sends far more event types than we
        // act on. Acknowledge them so Stripe stops retrying delivery.
        break;
    }
  } catch (error) {
    // Logging/lookup failures should not make Stripe retry an event we already parsed
    // correctly; retrying would not fix a bug in this handler.
    console.error('Error while processing Stripe webhook event:', event.type, error);
  }

  return NextResponse.json({ received: true });
}
