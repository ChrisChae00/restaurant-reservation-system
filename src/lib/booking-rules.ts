// Booking Rules Configuration
// Group reservation system for 7-14 people with fixed time slots only

// ============================================
// CAPACITY & CONSTANTS
// ============================================
export const MAX_CAPACITY = 42; // Maximum guests at any given time
export const NO_SHOW_FEE_PER_PERSON = 20; // CAD (will be 2000 cents in Stripe)
export const CANCELLATION_WINDOW_DAYS = 7; // 1 week prior to reservation
export const GUEST_CHANGE_WINDOW_HOURS = 12; // 12 hours prior to reservation

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
  type: 'early' | 'late';
}

export interface DayConfig {
  isOpen: boolean;
  dayName: string;
  slots: TimeSlot[];
}

// ============================================
// FIXED TIME SLOTS (No 15-min intervals!)
// ============================================

// Tuesday, Wednesday, Thursday
const TUE_WED_THU_SLOTS: TimeSlot[] = [
  {
    id: 'tue-thu-early',
    arrivalStart: '16:30',
    arrivalEnd: '17:00',
    slotEnd: '19:30',
    label: '16:30-17:00 → 19:30',
    type: 'early',
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
    arrivalStart: '16:30',
    arrivalEnd: '17:00',
    slotEnd: '19:15',
    label: '16:30-17:00 → 19:15',
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
  0: { isOpen: false, dayName: 'Sunday', slots: [] },
  1: { isOpen: false, dayName: 'Monday', slots: [] },
  2: { isOpen: true, dayName: 'Tuesday', slots: TUE_WED_THU_SLOTS },
  3: { isOpen: true, dayName: 'Wednesday', slots: TUE_WED_THU_SLOTS },
  4: { isOpen: true, dayName: 'Thursday', slots: TUE_WED_THU_SLOTS },
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

export function getSlotsForDate(date: Date): TimeSlot[] {
  const dayOfWeek = date.getDay();
  const config = RESTAURANT_SCHEDULE[dayOfWeek];
  return config?.isOpen ? config.slots : [];
}

export function isRestaurantOpen(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return RESTAURANT_SCHEDULE[dayOfWeek]?.isOpen ?? false;
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
  phone: '(514) 555-0123',
  email: 'reservations@restoluna.com',
};
