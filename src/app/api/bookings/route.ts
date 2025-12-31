// API Route: Create Booking
// POST /api/bookings

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createBookingRequestSchema } from '@/lib/validations';
import { checkSlotAvailability } from '@/lib/availability';
import { sendNewReservationNotification, sendReservationReceivedEmail } from '@/lib/email';
import { requireAuth } from '@/lib/auth';

/**
 * Generate a 6-digit booking reference in MMDDNN format
 * MM = month, DD = day, NN = sequence number (01-99)
 * Example: 123101 = December 31, first booking
 */
async function generateBookingReference(bookingDate: string, supabase: ReturnType<typeof createServerClient>): Promise<string> {
  const date = new Date(bookingDate + 'T12:00:00');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${month}${day}`;
  
  // Find existing bookings for this date to determine sequence number
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('booking_reference')
    .like('booking_reference', `${datePrefix}%`)
    .order('booking_reference', { ascending: false })
    .limit(1);
  
  let sequenceNum = 1;
  if (existingBookings && existingBookings.length > 0 && existingBookings[0].booking_reference) {
    const lastRef = existingBookings[0].booking_reference;
    const lastSeq = parseInt(lastRef.slice(-2), 10);
    sequenceNum = lastSeq + 1;
  }
  
  // Ensure we don't exceed 99 bookings per day (extremely unlikely)
  if (sequenceNum > 99) {
    throw new Error('Maximum bookings per day exceeded');
  }
  
  return `${datePrefix}${String(sequenceNum).padStart(2, '0')}`;
}

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

    // Generate user-friendly booking reference (MMDDNN format)
    const bookingReference = await generateBookingReference(bookingDate, supabase);

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
        accepted_cancellation_policy: true,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: stripePaymentMethodId,
        status: 'pending',
        email_language: emailLanguage || 'en',
        booking_reference: bookingReference,
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

    // Send notification email to restaurant manager
    // Must await in serverless environment (Vercel) - function terminates after response
    try {
      await sendNewReservationNotification(booking);
    } catch (err) {
      // Log but don't fail the booking if email fails
      console.error('Failed to send notification email:', err);
    }

    // Send reservation received confirmation email to customer
    try {
      await sendReservationReceivedEmail(booking);
    } catch (err) {
      // Log but don't fail the booking if email fails
      console.error('Failed to send customer confirmation email:', err);
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        bookingReference: booking.booking_reference,
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
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    // usage: ?status=pending,confirmed
    const status = searchParams.get('status');

    const supabase = createServerClient();

    let query = supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('slot_start', { ascending: true });

    if (date) {
      query = query.eq('booking_date', date);
    } else if (startDate && endDate) {
      query = query.gte('booking_date', startDate).lte('booking_date', endDate);
    }

    if (status) {
      const statuses = status.split(',');
      if (statuses.length > 1) {
        query = query.in('status', statuses);
      } else {
        query = query.eq('status', status);
      }
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
