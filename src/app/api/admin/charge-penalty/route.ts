// API Route: Charge No-Show Penalty (Admin)
// POST /api/admin/charge-penalty

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { chargeNoShowFee } from '@/lib/stripe';
import { chargePenaltyRequestSchema } from '@/lib/validations';
import { requireAuth } from '@/lib/auth';
import { sendNoShowChargeEmail } from '@/lib/email';

// Proxies the charge to the backend's queued pipeline (see backend/src/routes/admin.ts)
// when configured. Flipping CHARGE_VIA_BACKEND off routes traffic back through the
// synchronous path below with no deploy required -- the safety net for a payment-path
// change.
async function proxyToBackend(
  bookingId: string,
  guestCount: number | undefined,
  customAmount: number | undefined
): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_URL;
  const secret = process.env.BACKEND_INTERNAL_SECRET;
  if (!backendUrl || !secret) {
    throw new Error('BACKEND_URL / BACKEND_INTERNAL_SECRET must be set when CHARGE_VIA_BACKEND=true');
  }

  const response = await fetch(`${backendUrl}/api/admin/bookings/${bookingId}/charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ guestCount, customAmount }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const body = await request.json();

    // Validate request
    const validationResult = chargePenaltyRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { bookingId, guestCount, customAmount } = validationResult.data;

    if (process.env.CHARGE_VIA_BACKEND === 'true') {
      return await proxyToBackend(bookingId, guestCount, customAmount);
    }

    const supabase = createServerClient();

    // Fetch booking
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Check if already charged
    if (booking.status === 'noshow_charged') {
      return NextResponse.json(
        { error: 'Penalty already charged for this booking' },
        { status: 400 }
      );
    }

    // Check if booking has required Stripe info
    if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
      return NextResponse.json(
        { error: 'Missing payment information' },
        { status: 400 }
      );
    }

    // Determine guest count to charge (default to full party)
    const chargeGuestCount = guestCount ?? booking.party_size;

    // Validate guest count doesn't exceed party size
    if (chargeGuestCount > booking.party_size) {
      return NextResponse.json(
        { error: 'Guest count cannot exceed party size' },
        { status: 400 }
      );
    }

    // Convert custom amount to cents if provided
    const customAmountCents = customAmount ? Math.round(customAmount * 100) : undefined;

    // Charge the no-show fee ($20 per person or custom amount).
    // chargeNoShowFee sends an idempotency key, so a retry of this request returns the
    // original PaymentIntent rather than charging the guest a second time.
    const paymentIntent = await chargeNoShowFee(
      booking.stripe_customer_id,
      booking.stripe_payment_method_id,
      chargeGuestCount,
      booking.id,
      customAmountCents
    );

    // confirm: true can return without throwing while the payment is still unsettled
    // (processing, requires_action, requires_payment_method). Recording those as charged
    // would permanently mark the booking paid and email the guest about money that never
    // moved.
    if (paymentIntent.status !== 'succeeded') {
      console.error(
        'PaymentIntent did not succeed:', paymentIntent.id, paymentIntent.status
      );
      return NextResponse.json(
        {
          error: 'The payment did not complete. Please check Stripe before retrying.',
          paymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status,
        },
        { status: 402 }
      );
    }

    // Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'noshow_charged',
        penalty_charged_at: new Date().toISOString(),
        penalty_amount: paymentIntent.amount,
        penalty_payment_intent_id: paymentIntent.id,
      })
      .eq('id', bookingId);

    if (updateError) {
      // The guest's card has already been charged. Reporting success here left the booking
      // looking uncharged, so staff would press the button again.
      console.error(
        'Charged the card but failed to record it. Booking:', bookingId,
        'PaymentIntent:', paymentIntent.id, updateError
      );
      return NextResponse.json(
        {
          error: 'The card was charged, but the booking could not be updated. Do not retry — verify in Stripe.',
          chargedAmount: paymentIntent.amount / 100,
          paymentIntentId: paymentIntent.id,
        },
        { status: 500 }
      );
    }

    // Send email notification to customer. A mail failure must not surface as a charge
    // failure, or staff would retry a charge that already went through.
    try {
      await sendNoShowChargeEmail(booking, paymentIntent.amount / 100, chargeGuestCount);
    } catch (err) {
      console.error('Failed to send no-show charge email:', bookingId, err);
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('bookings')
        .update({
          last_email_error: message.slice(0, 500),
          last_email_error_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
    }

    return NextResponse.json({
      success: true,
      message: 'No-show penalty charged successfully',
      chargedAmount: paymentIntent.amount / 100, // Convert cents to dollars
      chargedGuestCount: chargeGuestCount,
      currency: 'CAD',
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Penalty charge error:', error);
    
    // Handle Stripe-specific errors
    if (error instanceof Error && error.message.includes('card')) {
      return NextResponse.json(
        { error: 'Card payment failed: ' + error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to charge penalty' },
      { status: 500 }
    );
  }
}
