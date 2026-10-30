import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';

// GET /api/admin/bookings/[id]/card
// The saved card's display details (brand, last 4, expiry) for the admin edit view. Only
// Stripe IDs are stored on the booking, so these come from Stripe; the full number never
// leaves Stripe.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { id } = await params;
    const supabase = createServerClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('stripe_payment_method_id')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const paymentMethod = await getStripe().paymentMethods.retrieve(booking.stripe_payment_method_id);
    const card = paymentMethod.card;
    if (!card) {
      return NextResponse.json({ error: 'No card on this payment method' }, { status: 404 });
    }

    return NextResponse.json({
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
    });
  } catch (error) {
    console.error('Card lookup error:', error);
    return NextResponse.json({ error: 'Failed to load card details' }, { status: 500 });
  }
}
