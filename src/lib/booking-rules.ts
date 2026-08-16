// Booking Rules Configuration
// Group reservation system for 7-14 people with fixed time slots only

// ============================================
// CAPACITY & CONSTANTS
// ============================================
export const MAX_CAPACITY = 45; // Maximum guests at any given time
export const NO_SHOW_FEE_PER_PERSON = 20; // CAD (will be 2000 cents in Stripe)

/**
 * Minutes since midnight. Accepts both HH:MM (slot definitions) and HH:MM:SS
 * (the Postgres TIME columns).
 *
 * A slot ending at '00:00' means midnight of the *next* day (the Fri/Sat
 * 21:30-00:00 seating), so as an end time it is 1440, not 0. Callers pass
 * `isEnd` for that case.
 */
export function timeToMinutes(time: string, isEnd = false): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  const minutes = h * 60 + m;
  return isEnd && minutes === 0 ? 24 * 60 : minutes;
}

/**
 * Do two seatings share any wall-clock time?
 *
 * Slots overlap by design — on Sun/Wed/Thu the early (17:00-19:30) and mid
 * (18:00-20:15) seatings are in the room together for 90 minutes — so counting
 * concurrent guests by exact (slot_start, slot_end) equality undercounts.
 * Touching boundaries (19:30 end vs 19:30 start) are not an overlap.
 */
export function slotsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return (
    timeToMinutes(aStart) < timeToMinutes(bEnd, true) &&
    timeToMinutes(bStart) < timeToMinutes(aEnd, true)
  );
}
export const CANCELLATION_WINDOW_DAYS = 7; // 1 week prior to reservation
export const GUEST_CHANGE_WINDOW_HOURS = 24; // 24 hours prior to reservation start time

// ============================================
// PARTY SIZE RULES
// ============================================
export const MIN_PARTY_SIZE = 7;
export const MAX_PARTY_SIZE = 14;
export const SMALL_GROUP_THRESHOLD = 6; // 1-6 goes to Libro
export const LARGE_GROUP_THRESHOLD = 15; // 15+ contact us

// External booking URL for small groups
export const LIBRO_BOOKING_URL = 'https://booking.libroreserve.com/22e6f18e91fac65/QC015718518987/seat';

// PDF Menu URL
export const MENU_PDF_URL = 'https://www.restoluna.com/_files/ugd/9b722f_9be64ff893224e9b8502c382629461a8.pdf';

// ============================================
// TIME SLOT TYPES
// ============================================
export interface TimeSlot {
  id: string;
  arrivalStart: string;  // HH:mm format
  arrivalEnd: string;    // HH:mm format (arrival window end)
  slotEnd: string;       // HH:mm format (when guests must leave)
  label: string;
  type: 'early' | 'mid' | 'late';
}

export interface DayConfig {
  isOpen: boolean;
  dayName: string;
  slots: TimeSlot[];
}

// ============================================
// FIXED TIME SLOTS (No 15-min intervals!)
// ============================================

// Sunday (same hours as the former Tuesday slots, with dedicated IDs)
const SUNDAY_SLOTS: TimeSlot[] = [
  {
    id: 'sun-early',
    arrivalStart: '17:00',
    arrivalEnd: '17:00',
    slotEnd: '19:30',
    label: '17:00 → 19:30',
    type: 'early',
  },
  {
    id: 'sun-mid',
    arrivalStart: '18:00',
    arrivalEnd: '18:00',
    slotEnd: '20:15',
    label: '18:00 → 20:15',
    type: 'mid',
  },
  {
    id: 'sun-late',
    arrivalStart: '20:30',
    arrivalEnd: '20:30',
    slotEnd: '23:00',
    label: '20:30 → 23:00',
    type: 'late',
  },
];

// Wednesday, Thursday (keeping legacy 'tue-thu-*' IDs for DB compatibility)
const WED_THU_SLOTS: TimeSlot[] = [
  {
    id: 'tue-thu-early',
    arrivalStart: '17:00',
    arrivalEnd: '17:00',
    slotEnd: '19:30',
    label: '17:00 → 19:30',
    type: 'early',
  },
  {
    id: 'tue-thu-mid',
    arrivalStart: '18:00',
    arrivalEnd: '18:00',
    slotEnd: '20:15',
    label: '18:00 → 20:15',
    type: 'mid',
  },
  {
    id: 'tue-thu-late',
    arrivalStart: '20:30',
    arrivalEnd: '20:30',
    slotEnd: '23:00',
    label: '20:30 → 23:00',
    type: 'late',
  },
];

// Friday, Saturday
const FRI_SAT_SLOTS: TimeSlot[] = [
  {
    id: 'fri-sat-early',
    arrivalStart: '17:00',
    arrivalEnd: '17:00',
    slotEnd: '19:15',
    label: '17:00 → 19:15',
    type: 'early',
  },
  {
    id: 'fri-sat-late',
    arrivalStart: '21:30',
    arrivalEnd: '21:30',
    slotEnd: '00:00',
    label: '21:30 → 00:00',
    type: 'late',
  },
];

// ============================================
// WEEKLY SCHEDULE
// ============================================
// 0 = Sunday, 1 = Monday, ..., 6 = Saturday
export const RESTAURANT_SCHEDULE: Record<number, DayConfig> = {
  0: { isOpen: true, dayName: 'Sunday', slots: SUNDAY_SLOTS },
  1: { isOpen: false, dayName: 'Monday', slots: [] },
  2: { isOpen: false, dayName: 'Tuesday', slots: [] },
  3: { isOpen: true, dayName: 'Wednesday', slots: WED_THU_SLOTS },
  4: { isOpen: true, dayName: 'Thursday', slots: WED_THU_SLOTS },
  5: { isOpen: true, dayName: 'Friday', slots: FRI_SAT_SLOTS },
  6: { isOpen: true, dayName: 'Saturday', slots: FRI_SAT_SLOTS },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export type PartySizeCategory = 'small' | 'group' | 'large';

export function getPartySizeCategory(partySize: number): PartySizeCategory {
  if (partySize >= 1 && partySize <= SMALL_GROUP_THRESHOLD) return 'small';
  if (partySize >= MIN_PARTY_SIZE && partySize <= MAX_PARTY_SIZE) return 'group';
  return 'large'; // 15+
}

/**
 * Get the DayConfig for a given date based on the weekly schedule.
 */
export function getEffectiveDayConfig(date: Date): DayConfig {
  const dayOfWeek = date.getDay();
  return RESTAURANT_SCHEDULE[dayOfWeek] ?? { isOpen: false, dayName: '', slots: [] };
}

export function getSlotsForDate(date: Date): TimeSlot[] {
  const config = getEffectiveDayConfig(date);
  return config.isOpen ? config.slots : [];
}

export function isRestaurantOpen(date: Date): boolean {
  return getEffectiveDayConfig(date).isOpen;
}

export function getDayName(dayOfWeek: number): string {
  return RESTAURANT_SCHEDULE[dayOfWeek]?.dayName ?? '';
}

// Format time for display
export function formatTimeRange(slot: TimeSlot): {
  arrival: string;
  departure: string;
} {
  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const arrivalText = slot.arrivalStart === slot.arrivalEnd
    ? formatTime(slot.arrivalStart)
    : `${formatTime(slot.arrivalStart)} - ${formatTime(slot.arrivalEnd)}`;

  return {
    arrival: arrivalText,
    departure: formatTime(slot.slotEnd),
  };
}

// Contact information
export const RESTAURANT_CONTACT = {
  phone_en: '(514) 224-8710',
  phone_fr: '(514) 834-8710',
  email: 'lunagroupreservation@gmail.com',
};
