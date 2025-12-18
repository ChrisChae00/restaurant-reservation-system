// Type Definitions for Group Booking System

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'noshow_charged';

export interface Booking {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  party_size: number;
  booking_date: string;
  slot_start: string;
  slot_end: string;
  allergy_info: string | null;
  accepted_menu_policy: boolean;
  accepted_house_rules: boolean;
  special_notes: string | null;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  status: BookingStatus;
  penalty_charged_at: string | null;
  penalty_amount: number | null;
  penalty_payment_intent_id: string | null;
}

export interface CreateBookingInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  party_size: number;
  booking_date: string;
  slot_start: string;
  slot_end: string;
  allergy_info?: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
}

// Multi-step form data
export interface BookingFormData {
  // Step 1: Landing
  partySize: number;
  agreedToRules: boolean;
  
  // Step 2: Details
  date: Date | undefined;
  slotId: string;
  slotStart: string;
  slotEnd: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Step 3: Menu Policy
  acceptedMenuPolicy: boolean;
  
  // Step 4: Allergy
  hasAllergies: boolean;
  allergyInfo: string;
  
  // Step 5: House Rules
  acceptedHouseRules: boolean;
  
  // Step 6: Card (handled by Stripe)
  acceptedCancellationPolicy: boolean;
}

// Form steps
export type BookingStep = 
  | 'landing'
  | 'details'
  | 'menu-policy'
  | 'allergy'
  | 'house-rules'
  | 'card-guarantee'
  | 'confirmation';

export const BOOKING_STEPS: BookingStep[] = [
  'landing',
  'details',
  'menu-policy',
  'allergy',
  'house-rules',
  'card-guarantee',
];

export interface ConfirmedBooking {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  partySize: number;
  date: string;
  slotStart: string;
  slotEnd: string;
}

// API Types
export interface AvailabilityRequest {
  date: string;
  partySize: number;
}

export interface SlotAvailability {
  slotId: string;
  arrivalStart: string;
  arrivalEnd: string;
  slotEnd: string;
  label: string;
  type: 'early' | 'late';
  available: boolean;
  currentGuests: number;
  remainingCapacity: number;
}

export interface AvailabilityResponse {
  date: string;
  partySize: number;
  isOpen: boolean;
  dayName: string;
  slots: SlotAvailability[];
}
