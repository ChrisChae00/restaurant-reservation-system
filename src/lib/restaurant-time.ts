// Restaurant-timezone date helpers with no server-only imports, so they can run in both
// server code (API routes) and client components (the admin dashboard).
//
// Using the runtime's local date instead would shift the 7-day cutoff by a day: on a UTC
// server (Vercel) every evening after 20:00 Montreal time is already tomorrow in UTC, and in
// a browser the cutoff would silently follow whatever timezone the admin's device is set to.

import { addDays, isBefore } from 'date-fns';

export const RESTAURANT_TIMEZONE = 'America/Montreal';

/** Today's calendar date in the restaurant's timezone, as YYYY-MM-DD. */
export function getRestaurantDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Parse a YYYY-MM-DD string at local noon, so DST and UTC offsets can never shift the day. */
export function parseDateOnly(dateStr: string): Date {
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
