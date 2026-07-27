// API Route: Create Booking
// POST /api/bookings

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createBookingRequestSchema } from '@/lib/validations';
import { checkSlotAvailability } from '@/lib/availability';
import { validateBookingRules } from '@/lib/booking-validation';
import { verifySetupIntent } from '@/lib/stripe';
import { sendNewReservationNotification, sendReservationReceivedEmail } from '@/lib/email';
import { requireAuth } from '@/lib/auth';

// Postgres unique-violation. Raised by the booking_reference index and by the
// one-team-per-slot index added in 20260727000100_prevent_double_booking.sql.
const PG_UNIQUE_VIOLATION = '23505';
const SLOT_CONFLICT_INDEX = 'idx_bookings_one_team_per_slot';

// How many times to regenerate a colliding reference before giving up.
const MAX_REFERENCE_ATTEMPTS = 5;

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
      setupIntentId,
    } = validationResult.data;

    // Enforce the schedule, the advance-booking window, and the slot definitions here too.
    // The wizard checks all of this, but a request sent directly to this route would
    // otherwise be able to book a closed day, a past date, or a time that is not a slot.
    const ruleCheck = await validateBookingRules({ bookingDate, slotId, slotStart, slotEnd });
    if (!ruleCheck.ok) {
      return NextResponse.json(
        { error: ruleCheck.failure.message, code: ruleCheck.failure.code },
        { status: 400 }
      );
    }

    // Persist the server's own slot times rather than whatever the client sent.
    const { arrivalStart: canonicalSlotStart, slotEnd: canonicalSlotEnd } = ruleCheck.slot;

    // Confirm with Stripe that a card was actually saved, and take the customer and
    // payment-method IDs from Stripe instead of from the request body.
    const card = await verifySetupIntent(setupIntentId);
    if (!card) {
      return NextResponse.json(
        { error: 'Card verification failed. Please re-enter your card details.' },
        { status: 400 }
      );
    }

    // Re-check availability to prevent race conditions
    const { available, currentGuests, remainingCapacity, viaOverride } =
      await checkSlotAvailability(bookingDate, canonicalSlotStart, canonicalSlotEnd, partySize, slotId);

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

    const bookingRow = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      party_size: partySize,
      booking_date: bookingDate,
      slot_start: canonicalSlotStart,
      slot_end: canonicalSlotEnd,
      allergy_info: allergyInfo || null,
      accepted_menu_policy: true,
      accepted_house_rules: true,
      accepted_cancellation_policy: true,
      stripe_customer_id: card.customerId,
      stripe_payment_method_id: card.paymentMethodId,
      status: 'pending' as const,
      email_language: emailLanguage || 'en',
      // Exempts this row from the one-team-per-slot index, but only because an admin
      // explicitly opened the slot for additional parties.
      bypassed_slot_limit: viaOverride,
    };

    // The reference sequence is derived from a prior SELECT, so two bookings created for
    // the same date at the same moment can compute the same value. Retry rather than
    // failing a customer whose slot is genuinely free.
    let booking = null;
    let insertError = null;

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const bookingReference = await generateBookingReference(bookingDate, supabase);
      const result = await supabase
        .from('bookings')
        .insert({ ...bookingRow, booking_reference: bookingReference })
        .select()
        .single();

      if (!result.error) {
        booking = result.data;
        insertError = null;
        break;
      }

      insertError = result.error;

      if (result.error.code !== PG_UNIQUE_VIOLATION) {
        break;
      }

      // PostgREST spreads the offending constraint across message/details/hint depending
      // on the error, so match against all of them.
      const errorText = [result.error.message, result.error.details, result.error.hint]
        .filter(Boolean)
        .join(' ');

      // Another party won the slot between our availability check and this insert.
      if (errorText.includes(SLOT_CONFLICT_INDEX)) {
        return NextResponse.json(
          {
            error: 'Time slot no longer available',
            details: { requestedPartySize: partySize },
          },
          { status: 409 }
        );
      }

      // Otherwise the reference collided with a concurrent booking; loop and pick the next.
    }

    if (insertError || !booking) {
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
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('bookings')
        .update({
          last_email_error: message.slice(0, 500),
          last_email_error_at: new Date().toISOString(),
        })
        .eq('id', booking.id);
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
