// Availability Checking Logic for Group Reservations
// Handles fixed time slot capacity calculations

import { createServerClient } from '@/lib/supabase/server';
import { TimeSlot, getSlotsForDate, MAX_CAPACITY, slotsOverlap } from '@/lib/booking-rules';
import type { SlotAvailability } from '@/types/booking';

/**
 * Check if a specific date and slot combination is blocked by admin
 */
export async function isSlotBlocked(
  date: string,
  slotId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('blocked_slots')
    .select('id')
    .eq('date', date)
    .eq('slot_id', slotId)
    .maybeSingle();

  // Discarding the error here reported a transient database failure as "not blocked",
  // which made admin-blocked slots bookable for the duration of the incident.
  if (error) {
    console.error('Error checking blocked_slots:', error);
    throw new Error('Failed to check slot availability');
  }

  return !!data;
}

/**
 * Get all blocked slot IDs for a specific date
 */
export async function getBlockedSlotIds(date: string): Promise<Set<string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('blocked_slots')
    .select('slot_id')
    .eq('date', date);

  // Returning an empty set on error would advertise every blocked slot as available.
  if (error) {
    console.error('Error fetching blocked_slots:', error);
    throw new Error('Failed to check slot availability');
  }

  return new Set((data || []).map(row => row.slot_id));
}

/**
 * Check if a slot is past the 1-hour cutoff (Montreal timezone)
 * Returns true if current time is within 1 hour of slot start
 */
function isSlotPastCutoff(dateStr: string, slotStart: string): boolean {
  // Get current time in Montreal timezone
  const now = new Date();
  const montrealFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montreal',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = montrealFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  const montrealNowStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  const montrealNow = new Date(montrealNowStr);
  
  // Parse slot start time
  const slotDateTime = new Date(`${dateStr}T${slotStart}:00`);
  
  // Cutoff is 1 hour before slot start
  const cutoffTime = new Date(slotDateTime.getTime() - 60 * 60 * 1000);
  
  return montrealNow >= cutoffTime;
}

/**
 * Sum the party sizes booked into one *exact* slot (same date, same start, same end).
 *
 * This backs the one-team-per-slot gate and deliberately mirrors the partial unique
 * index `idx_bookings_one_team_per_slot`, which is also keyed on the exact tuple.
 * It is NOT a measure of how many guests are in the room at once — overlapping
 * seatings land in different buckets. Use `getConcurrentGuests` for capacity.
 */
export async function getGuestsInTimeRange(
  date: string,
  slotStart: string,
  slotEnd: string
): Promise<number> {
  const supabase = createServerClient();

  // Normalize time format to HH:MM:SS to match PostgreSQL TIME type
  const normalizeTime = (time: string) => {
    const parts = time.split(':');
    if (parts.length === 2) {
      return `${time}:00`; // HH:MM -> HH:MM:SS
    }
    return time; // Already HH:MM:SS
  };

  const normalizedStart = normalizeTime(slotStart);
  const normalizedEnd = normalizeTime(slotEnd);

  // Include pending to block slots when reservation is pending approval
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('party_size')
    .eq('booking_date', date)
    .eq('slot_start', normalizedStart)
    .eq('slot_end', normalizedEnd)
    .in('status', ['pending', 'confirmed', 'completed']);

  if (error) {
    console.error('Error fetching overlapping bookings:', error);
    throw new Error('Failed to check availability');
  }

  // Sum up all party sizes
  const totalGuests = (bookings || []).reduce(
    (sum, booking) => sum + booking.party_size,
    0
  );

  return totalGuests;
}

/**
 * Total guests whose seating actually overlaps the given window, for capacity checks.
 *
 * Unlike `getGuestsInTimeRange` this crosses slot boundaries: the 17:00-19:30 and
 * 18:00-20:15 parties are in the room together and both count. Pass
 * `excludeBookingId` when re-checking a booking that is itself being edited.
 *
 * The overlap is computed in JS rather than SQL because a slot ending at '00:00'
 * means next-day midnight, which a PostgREST `time` comparison cannot express.
 * A single date holds a handful of rows, so the filtering cost is irrelevant.
 */
export async function getConcurrentGuests(
  date: string,
  slotStart: string,
  slotEnd: string,
  excludeBookingId?: string
): Promise<number> {
  const supabase = createServerClient();

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, party_size, slot_start, slot_end')
    .eq('booking_date', date)
    .in('status', ['pending', 'confirmed', 'completed']);

  // Reporting a transient failure as "nobody is here" would wave through an
  // overbooking, so fail loudly like the other helpers in this file.
  if (error) {
    console.error('Error fetching bookings for capacity check:', error);
    throw new Error('Failed to check availability');
  }

  return (bookings || [])
    .filter(
      (booking) =>
        booking.id !== excludeBookingId &&
        slotsOverlap(slotStart, slotEnd, booking.slot_start, booking.slot_end)
    )
    .reduce((sum, booking) => sum + booking.party_size, 0);
}

/**
 * Check if a specific slot is available
 * One team per slot - if any booking exists, slot is unavailable
 * UNLESS admin has allowed additional bookings via allowed_slots
 */
export async function checkSlotAvailability(
  date: string,
  slotStart: string,
  slotEnd: string,
  partySize: number,
  slotId?: string
): Promise<{
  available: boolean;
  currentGuests: number;
  remainingCapacity: number;
  /** True when the slot is only available because an admin opened it for an extra party. */
  viaOverride: boolean;
}> {
  // 1. Check if blocked by admin (if slotId provided)
  if (slotId) {
    const blocked = await isSlotBlocked(date, slotId);
    if (blocked) {
      return {
        available: false,
        currentGuests: 0,
        remainingCapacity: 0,
        viaOverride: false,
      };
    }
  }

  // 2. Check if any booking exists for this slot (one team per slot)
  const currentGuests = await getGuestsInTimeRange(date, slotStart, slotEnd);
  const hasExistingBooking = currentGuests > 0;

  // 3. If booking exists, check if admin allowed additional bookings
  if (hasExistingBooking && slotId) {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('allowed_slots')
      .select('id')
      .eq('date', date)
      .eq('slot_id', slotId)
      .maybeSingle();

    if (error) {
      console.error('Error checking allowed_slots:', error);
      throw new Error('Failed to check slot availability');
    }

    // If admin allowed additional bookings, the slot is available but still capped at
    // MAX_CAPACITY total guests — otherwise repeated overrides could stack unlimited teams
    // into one seating. The cap counts everyone in the room at the same time, not just
    // this exact slot, or an override could seat 45 on top of an overlapping seating.
    if (data) {
      const concurrentGuests = await getConcurrentGuests(date, slotStart, slotEnd);
      const remainingCapacity = Math.max(0, MAX_CAPACITY - concurrentGuests);
      return {
        available: partySize <= remainingCapacity,
        currentGuests,
        remainingCapacity,
        viaOverride: true,
      };
    }
  }

  return {
    available: !hasExistingBooking,
    currentGuests,
    remainingCapacity: hasExistingBooking ? 0 : partySize, // If available, user can book their party size
    viaOverride: false,
  };
}

/**
 * Get availability for all fixed slots on a given date
 */
export async function getAvailabilityForDate(
  date: Date,
  partySize: number
): Promise<SlotAvailability[]> {
  const dateStr = date.toISOString().split('T')[0];
  const slots = getSlotsForDate(date);
  
  // Fetch blocked slots for this date to avoid N+1 queries
  const blockedSlotIds = await getBlockedSlotIds(dateStr);

  const availabilityPromises = slots.map(async (slot: TimeSlot) => {
    // 1. Check if blocked by admin
    if (blockedSlotIds.has(slot.id)) {
      return {
        slotId: slot.id,
        arrivalStart: slot.arrivalStart,
        arrivalEnd: slot.arrivalEnd,
        slotEnd: slot.slotEnd,
        label: slot.label,
        type: slot.type,
        available: false,
        currentGuests: 0,
        remainingCapacity: 0,
      };
    }

    // 2. Check if past the 1-hour cutoff (same-day bookings only)
    if (isSlotPastCutoff(dateStr, slot.arrivalStart)) {
      return {
        slotId: slot.id,
        arrivalStart: slot.arrivalStart,
        arrivalEnd: slot.arrivalEnd,
        slotEnd: slot.slotEnd,
        label: slot.label,
        type: slot.type,
        available: false,
        currentGuests: 0,
        remainingCapacity: 0,
      };
    }

    // 3. Otherwise check capacity (pass slotId for allowed_slots check)
    const { available, currentGuests, remainingCapacity } =
      await checkSlotAvailability(dateStr, slot.arrivalStart, slot.slotEnd, partySize, slot.id);

    return {
      slotId: slot.id,
      arrivalStart: slot.arrivalStart,
      arrivalEnd: slot.arrivalEnd,
      slotEnd: slot.slotEnd,
      label: slot.label,
      type: slot.type,
      available,
      currentGuests,
      remainingCapacity,
    };
  });

  return Promise.all(availabilityPromises);
}

