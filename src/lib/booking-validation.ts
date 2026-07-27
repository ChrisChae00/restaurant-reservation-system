// Server-side booking rule enforcement.
//
// These checks used to live only in /api/availability, which meant a request sent straight
// to /api/bookings could create a reservation on a closed day, in the past, inside the
// 7-day window, or at a time that is not a real service slot. Both routes now share this
// module so the rules cannot drift apart.

import { addDays, isBefore } from 'date-fns';
import { createServerClient } from '@/lib/supabase/server';
import { getEffectiveDayConfig, getSlotsForDate, type TimeSlot } from '@/lib/booking-rules';

export const RESTAURANT_TIMEZONE = 'America/Montreal';

/**
 * Today's calendar date in the restaurant's timezone, as YYYY-MM-DD.
 *
 * Using the runtime's local date instead would shift the 7-day cutoff by a day every
 * evening on a UTC host (Vercel): after 20:00 in Montreal it is already tomorrow in UTC.
 */
export function getRestaurantDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Parse a YYYY-MM-DD string at local noon, so DST and UTC offsets can never shift the day. */
function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

/** True when the date falls before today in the restaurant's timezone. */
export function isPastDate(dateStr: string, now: Date = new Date()): boolean {
  return isBefore(parseDateOnly(dateStr), parseDateOnly(getRestaurantDateString(now)));
}

/**
 * True when the date is inside the 7-day advance-booking window and therefore requires an
 * explicit admin override in `allowed_dates`.
 */
export function isWithin7Days(dateStr: string, now: Date = new Date()): boolean {
  const minDate = addDays(parseDateOnly(getRestaurantDateString(now)), 7);
  return isBefore(parseDateOnly(dateStr), minDate);
}

/** True when an admin has explicitly opened this date inside the 7-day window. */
export async function isDateAllowed(dateStr: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('allowed_dates')
    .select('id')
    .eq('date', dateStr)
    .maybeSingle();

  if (error) {
    console.error('Error checking allowed_dates:', error);
    throw new Error('Failed to check date availability');
  }

  return !!data;
}

export type BookingRuleFailure =
  | { code: 'PAST_DATE'; message: string }
  | { code: 'CLOSED_DAY'; message: string }
  | { code: 'UNKNOWN_SLOT'; message: string }
  | { code: 'SLOT_TIME_MISMATCH'; message: string }
  | { code: 'TOO_SOON'; message: string };

export type BookingRuleResult =
  | { ok: true; slot: TimeSlot }
  | { ok: false; failure: BookingRuleFailure };

/**
 * Validate a booking request against the schedule, the advance-booking window, and the
 * canonical slot definitions.
 *
 * On success the caller receives the server's own TimeSlot and should persist its times
 * rather than the ones supplied by the client.
 */
export async function validateBookingRules(params: {
  bookingDate: string;
  slotId: string;
  slotStart: string;
  slotEnd: string;
  now?: Date;
}): Promise<BookingRuleResult> {
  const { bookingDate, slotId, slotStart, slotEnd, now = new Date() } = params;

  if (isPastDate(bookingDate, now)) {
    return { ok: false, failure: { code: 'PAST_DATE', message: 'Cannot book a date in the past' } };
  }

  const dateObj = parseDateOnly(bookingDate);
  const dayConfig = getEffectiveDayConfig(dateObj);
  if (!dayConfig.isOpen) {
    return {
      ok: false,
      failure: { code: 'CLOSED_DAY', message: `The restaurant is closed on ${dayConfig.dayName}s` },
    };
  }

  const slot = getSlotsForDate(dateObj).find((candidate) => candidate.id === slotId);
  if (!slot) {
    return {
      ok: false,
      failure: { code: 'UNKNOWN_SLOT', message: 'The selected time slot is not available on this date' },
    };
  }

  // The client echoes back the times it was served; a mismatch means a stale page or a
  // tampered payload, either of which would book a time the guest never saw.
  if (slot.arrivalStart !== slotStart || slot.slotEnd !== slotEnd) {
    return {
      ok: false,
      failure: { code: 'SLOT_TIME_MISMATCH', message: 'The selected time slot is no longer valid. Please reselect your time.' },
    };
  }

  if (isWithin7Days(bookingDate, now) && !(await isDateAllowed(bookingDate))) {
    return {
      ok: false,
      failure: { code: 'TOO_SOON', message: 'Reservations must be made at least 7 days in advance' },
    };
  }

  return { ok: true, slot };
}
