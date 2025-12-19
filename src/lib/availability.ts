// Availability Checking Logic for Group Reservations
// Handles fixed time slot capacity calculations

import { createServerClient } from '@/lib/supabase/server';
import { TimeSlot, getSlotsForDate } from '@/lib/booking-rules';
import type { SlotAvailability } from '@/types/booking';

/**
 * Check if a specific date and slot combination is blocked by admin
 */
export async function isSlotBlocked(
  date: string,
  slotId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('blocked_slots')
    .select('id')
    .eq('date', date)
    .eq('slot_id', slotId)
    .single();
  
  return !!data;
}

/**
 * Get all blocked slot IDs for a specific date
 */
export async function getBlockedSlotIds(date: string): Promise<Set<string>> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('blocked_slots')
    .select('slot_id')
    .eq('date', date);
  
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
 * Calculate the number of guests during a specific time range
 * by querying overlapping bookings from the database.
 * Includes pending, confirmed, and completed reservations
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

  // Query for overlapping bookings
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
 * Check if a specific slot is available
 * One team per slot - if any booking exists, slot is unavailable
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
}> {
  // 1. Check if blocked by admin (if slotId provided)
  if (slotId) {
    const blocked = await isSlotBlocked(date, slotId);
    if (blocked) {
      return {
        available: false,
        currentGuests: 0,
        remainingCapacity: 0,
      };
    }
  }

  // 2. Check if any booking exists for this slot (one team per slot)
  const currentGuests = await getGuestsInTimeRange(date, slotStart, slotEnd);
  const hasExistingBooking = currentGuests > 0;

  return {
    available: !hasExistingBooking,
    currentGuests,
    remainingCapacity: hasExistingBooking ? 0 : partySize, // If available, user can book their party size
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

    // 3. Otherwise check capacity
    const { available, currentGuests, remainingCapacity } =
      await checkSlotAvailability(dateStr, slot.arrivalStart, slot.slotEnd, partySize);

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

