// Form Validation Schemas using Zod

import { z } from 'zod';
import {
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  NO_SHOW_FEE_PER_PERSON as NO_SHOW_FEE_PER_PERSON_CAD,
} from '@/lib/booking-rules';

// HTML sanitization helper to prevent XSS
const sanitizeHtml = (str: string) => str
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;')
  .replace(/\//g, '&#x2F;');

// Safe string schema that sanitizes HTML
const safeString = (minLen = 1, maxLen = 50) => z
  .string()
  .min(minLen, `Minimum length is ${minLen}`)
  .max(maxLen, `Maximum length is ${maxLen}`)
  .transform(sanitizeHtml);

// Step 1: Landing validation
export const landingSchema = z.object({
  partySize: z
    .number()
    .min(MIN_PARTY_SIZE, `Minimum group size is ${MIN_PARTY_SIZE}`)
    .max(MAX_PARTY_SIZE, `Maximum group size is ${MAX_PARTY_SIZE}`),
  agreedToRules: z.literal(true, {
    message: 'You must agree to the reservation policies',
  }),
});

// Step 2: Details validation
export const detailsSchema = z.object({
  date: z.date({ message: 'Please select a date' }),
  slotId: z.string().min(1, 'Please select a time slot'),
  slotStart: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  slotEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  firstName: safeString(1, 50),
  lastName: safeString(1, 50),
  email: z.string().email('Please enter a valid email address'),
  phone: z
    .string()
    .min(10, 'Please enter a valid phone number')
    .max(20, 'Phone number is too long')
    .regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format'),
});

// Step 3: Menu Policy validation
export const menuPolicySchema = z.object({
  acceptedMenuPolicy: z.literal(true, {
    message: 'You must accept the menu policy',
  }),
});

// Step 4: Allergy validation
export const allergySchema = z.object({
  hasAllergies: z.boolean(),
  allergyInfo: z.string().max(1000, 'Allergy information is too long').optional(),
}).refine(
  (data) => !data.hasAllergies || (data.allergyInfo && data.allergyInfo.length > 0),
  {
    message: 'Please describe the allergies',
    path: ['allergyInfo'],
  }
);

// Step 5: House Rules validation
export const houseRulesSchema = z.object({
  acceptedHouseRules: z.literal(true, {
    message: 'You must agree to the house rules',
  }),
});

// Step 6: Card Guarantee validation
export const cardGuaranteeSchema = z.object({
  acceptedCancellationPolicy: z.literal(true, {
    message: 'You must accept the cancellation policy',
  }),
});

// Complete booking form validation
export const bookingFormSchema = z.object({
  partySize: landingSchema.shape.partySize,
  agreedToRules: landingSchema.shape.agreedToRules,
  date: detailsSchema.shape.date,
  slotId: detailsSchema.shape.slotId,
  slotStart: detailsSchema.shape.slotStart,
  slotEnd: detailsSchema.shape.slotEnd,
  firstName: detailsSchema.shape.firstName,
  lastName: detailsSchema.shape.lastName,
  email: detailsSchema.shape.email,
  phone: detailsSchema.shape.phone,
  acceptedMenuPolicy: menuPolicySchema.shape.acceptedMenuPolicy,
  hasAllergies: allergySchema.shape.hasAllergies,
  allergyInfo: allergySchema.shape.allergyInfo,
  acceptedHouseRules: houseRulesSchema.shape.acceptedHouseRules,
  acceptedCancellationPolicy: cardGuaranteeSchema.shape.acceptedCancellationPolicy,
});

// API request validation
export const availabilityRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  partySize: z.number().min(MIN_PARTY_SIZE).max(MAX_PARTY_SIZE),
});

export const createBookingRequestSchema = z.object({
  firstName: detailsSchema.shape.firstName,
  lastName: detailsSchema.shape.lastName,
  email: detailsSchema.shape.email,
  phone: detailsSchema.shape.phone,
  partySize: z.number().int().min(MIN_PARTY_SIZE).max(MAX_PARTY_SIZE),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // An empty slotId used to skip the admin block/override lookups entirely, since the
  // callers guarded on a falsy value.
  slotId: z.string().min(1),
  slotStart: z.string().regex(/^\d{2}:\d{2}$/),
  slotEnd: z.string().regex(/^\d{2}:\d{2}$/),
  allergyInfo: z.string().max(1000).transform(sanitizeHtml).optional().nullable(),
  emailLanguage: z.enum(['en', 'fr']).optional(),
  // The card identity is resolved server-side from this SetupIntent. Accepting the customer
  // and payment-method IDs directly let a caller attach someone else's saved card to their
  // own booking, which would charge that person for the no-show.
  setupIntentId: z.string().min(1),
});

// Ceiling for the manual penalty override. Without one, a mistyped amount in the admin
// modal (e.g. entering cents where dollars are expected) charges a real card off-session.
const MAX_PENALTY_AMOUNT_CAD = (NO_SHOW_FEE_PER_PERSON_CAD * MAX_PARTY_SIZE);

export const chargePenaltyRequestSchema = z.object({
  bookingId: z.string().uuid(),
  guestCount: z.number().int().min(1).optional(), // If not provided, charge full party
  customAmount: z.number().min(1).max(MAX_PENALTY_AMOUNT_CAD).optional(), // Dollars
});

// Type exports
export type LandingFormData = z.infer<typeof landingSchema>;
export type DetailsFormData = z.infer<typeof detailsSchema>;
export type MenuPolicyFormData = z.infer<typeof menuPolicySchema>;
export type AllergyFormData = z.infer<typeof allergySchema>;
export type HouseRulesFormData = z.infer<typeof houseRulesSchema>;
export type CardGuaranteeFormData = z.infer<typeof cardGuaranteeSchema>;
export type BookingFormData = z.infer<typeof bookingFormSchema>;
export type CreateBookingRequestData = z.infer<typeof createBookingRequestSchema>;
