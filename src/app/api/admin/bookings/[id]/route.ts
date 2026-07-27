import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { sendConfirmationEmail, sendCancellationEmail } from '@/lib/email';
import { requireAuth } from '@/lib/auth';
import { getSlotsForDate } from '@/lib/booking-rules';
import { parseDateOnly } from '@/lib/restaurant-time';
import type { BookingStatus } from '@/types/booking';

// Postgres unique-violation, also raised here by the one-team-per-slot index when an
// admin edit moves a booking into an already-occupied slot.
const PG_UNIQUE_VIOLATION = '23505';
const SLOT_CONFLICT_INDEX = 'idx_bookings_one_team_per_slot';

const VALID_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'noshow_charged',
];

// Record that the notification failed so the admin dashboard can surface it, instead of
// the failure being visible only in server logs.
async function recordEmailFailure(
  supabase: ReturnType<typeof createServerClient>,
  bookingId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : String(error);
  await supabase
    .from('bookings')
    .update({
      last_email_error: message.slice(0, 500),
      last_email_error_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
}

// PATCH /api/admin/bookings/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { id } = await params;
    const body = await request.json();
    const {
      status,
      first_name,
      last_name,
      email,
      phone,
      party_size,
      booking_date,
      slot_start,
      slot_end,
      allergy_info,
      // The version of the row the admin last saw. Two admins editing the same booking at
      // once would otherwise let the second save silently overwrite the first.
      updated_at,
    } = body;

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: currentBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!currentBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Optimistic locking. The comparison is done here in application code rather than as an
    // `.eq('updated_at', ...)` filter on the UPDATE: round-tripping a microsecond-precision
    // timestamptz back through PostgREST as an exact-match filter is fragile, and if it ever
    // failed to match, every confirm/cancel/edit would return a spurious conflict and the
    // restaurant could not manage bookings at all. This check catches the case that actually
    // happens -- an admin saving from a page loaded before someone else's change -- and the
    // residual window (two saves inside the same few milliseconds) is not a real risk here.
    if (updated_at && updated_at !== currentBooking.updated_at) {
      return NextResponse.json(
        { error: 'This booking was changed by someone else. Please refresh and try again.' },
        { status: 409 }
      );
    }

    // 1. Cancel without charge
    if (status === 'cancelled') {
      const { data, error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      try {
        await sendCancellationEmail(data);
      } catch (err) {
        console.error('Failed to send cancellation email:', err);
        await recordEmailFailure(supabase, id, err);
      }

      return NextResponse.json({ success: true, booking: data });
    }

    // 2. Full update (edit) — validate any time/party-size change against the real slot
    // definitions rather than accepting arbitrary values.
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (allergy_info !== undefined) updates.allergy_info = allergy_info;

    const dateChanged = booking_date !== undefined && booking_date !== currentBooking.booking_date;
    const startChanged = slot_start !== undefined && slot_start !== currentBooking.slot_start;
    const endChanged = slot_end !== undefined && slot_end !== currentBooking.slot_end;
    const sizeChanged = party_size !== undefined && party_size !== currentBooking.party_size;

    if (dateChanged || startChanged || endChanged) {
      const targetDate = booking_date ?? currentBooking.booking_date;
      // slot_start/slot_end are stored as HH:MM:SS; the slot definitions use HH:MM.
      const targetStart = (slot_start ?? currentBooking.slot_start).slice(0, 5);
      const targetEnd = (slot_end ?? currentBooking.slot_end).slice(0, 5);

      const matchedSlot = getSlotsForDate(parseDateOnly(targetDate)).find(
        (slot) => slot.arrivalStart === targetStart && slot.slotEnd === targetEnd
      );

      if (!matchedSlot) {
        return NextResponse.json(
          { error: 'The selected date and time do not match a valid reservation slot' },
          { status: 400 }
        );
      }

      updates.booking_date = targetDate;
      updates.slot_start = `${targetStart}:00`;
      updates.slot_end = `${targetEnd}:00`;
    }

    if (sizeChanged) {
      if (!Number.isInteger(party_size) || party_size < 1) {
        return NextResponse.json({ error: 'Invalid party size' }, { status: 400 });
      }
      updates.party_size = party_size;
    }

    const { data: updatedBooking, error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        const errorText = [error.message, error.details, error.hint].filter(Boolean).join(' ');
        if (errorText.includes(SLOT_CONFLICT_INDEX)) {
          return NextResponse.json(
            { error: 'Another booking already occupies that date and time slot' },
            { status: 409 }
          );
        }
      }
      throw error;
    }

    if (!updatedBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (status === 'confirmed') {
      try {
        await sendConfirmationEmail(updatedBooking);
      } catch (err) {
        console.error('Failed to send confirmation email:', err);
        await recordEmailFailure(supabase, id, err);
      }
    }

    return NextResponse.json({ success: true, booking: updatedBooking });

  } catch (error) {
    console.error('Update booking error:', error);
    return NextResponse.json(
      { error: 'Failed to update booking' },
      { status: 500 }
    );
  }
}
