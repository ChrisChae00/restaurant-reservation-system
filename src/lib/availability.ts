// Availability Checking Logic for Group Reservations
// Handles fixed time slot capacity calculations

import { createServerClient } from '@/lib/supabase/server';
import { MAX_CAPACITY, TimeSlot, getSlotsForDate } from '@/lib/booking-rules';
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
 * Calculate the number of guests during a specific time range
 * by querying overlapping bookings from the database.
 */
export async function getGuestsInTimeRange(
  date: string,
  slotStart: string,
  slotEnd: string
): Promise<number> {
  const supabase = createServerClient();

  // Query for overlapping bookings
  // For fixed slots, we can do exact match on slot times
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('party_size')
    .eq('booking_date', date)
    .eq('slot_start', slotStart)
    .eq('slot_end', slotEnd)
    .in('status', ['confirmed', 'completed']);

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
 * Check if a specific slot is available for a given party size
 * Optional slotId parameter to check for admin blocks
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

  // 2. Check capacity
  const currentGuests = await getGuestsInTimeRange(date, slotStart, slotEnd);
  const remainingCapacity = MAX_CAPACITY - currentGuests;
  const available = remainingCapacity >= partySize;

  return {
    available,
    currentGuests,
    remainingCapacity,
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
    // If blocked, return unavailable immediately
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

    // Otherwise check capacity
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
