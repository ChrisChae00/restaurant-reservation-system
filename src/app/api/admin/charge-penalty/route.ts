// API Route: Charge No-Show Penalty (Admin)
// POST /api/admin/charge-penalty

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { chargeNoShowFee } from '@/lib/stripe';
import { chargePenaltyRequestSchema } from '@/lib/validations';
import { requireAuth } from '@/lib/auth';
import { sendNoShowChargeEmail } from '@/lib/email';

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

    // Charge the no-show fee ($20 per person or custom amount)
    const paymentIntent = await chargeNoShowFee(
      booking.stripe_customer_id,
      booking.stripe_payment_method_id,
      chargeGuestCount,
      booking.id,
      customAmountCents
    );

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
      console.error('Failed to update booking status:', updateError);
      // Payment was successful but status update failed
      // This is logged but shouldn't fail the API response
    }

    // Send email notification to customer
    await sendNoShowChargeEmail(booking, paymentIntent.amount / 100, chargeGuestCount);

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
