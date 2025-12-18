// API Route: Create Booking
// POST /api/bookings

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createBookingRequestSchema } from '@/lib/validations';
import { checkSlotAvailability } from '@/lib/availability';
import { sendNewReservationNotification } from '@/lib/email';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validationResult = createBookingRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid booking data', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      partySize,
      bookingDate,
      slotId,
      slotStart,
      slotEnd,
      allergyInfo,
      emailLanguage,
      stripeCustomerId,
      stripePaymentMethodId,
    } = validationResult.data;

    // Re-check availability to prevent race conditions
    const { available, currentGuests, remainingCapacity } = 
      await checkSlotAvailability(bookingDate, slotStart, slotEnd, partySize, slotId);

    if (!available) {
      return NextResponse.json(
        { 
          error: 'Time slot no longer available',
          details: {
            currentGuests,
            remainingCapacity,
            requestedPartySize: partySize,
          }
        },
        { status: 409 } // Conflict
      );
    }

    // Create booking in database
    const supabase = createServerClient();

    const { data: booking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        party_size: partySize,
        booking_date: bookingDate,
        slot_start: slotStart,
        slot_end: slotEnd,
        allergy_info: allergyInfo || null,
        accepted_menu_policy: true,
        accepted_house_rules: true,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: stripePaymentMethodId,
        status: 'pending',
        email_language: emailLanguage || 'en',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      );
    }

    // Send notification email to restaurant manager (non-blocking)
    sendNewReservationNotification(booking).catch(err => 
      console.error('Failed to send notification email:', err)
    );

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        firstName: booking.first_name,
        lastName: booking.last_name,
        email: booking.email,
        partySize: booking.party_size,
        date: booking.booking_date,
        slotStart: booking.slot_start,
        slotEnd: booking.slot_end,
        status: booking.status,
      },
      message: 'Reservation received! We will confirm your booking shortly.',
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    return NextResponse.json(
      { error: 'Failed to process booking' },
      { status: 500 }
    );
  }
}

// GET /api/bookings - List bookings (for admin only)
export async function GET(request: NextRequest) {
  try {
    // Check authentication - this is admin-only
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    const supabase = createServerClient();

    let query = supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('slot_start', { ascending: true });

    if (date) {
      query = query.eq('booking_date', date);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: bookings, error } = await query.limit(100);

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bookings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ bookings });
  } catch (error) {
    console.error('Bookings fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
