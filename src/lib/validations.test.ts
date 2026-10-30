import { describe, expect, it } from 'vitest';
import { createBookingRequestSchema } from './validations';
import { VISIT_PURPOSES } from '@/types/booking';

const base = {
  firstName: 'Test',
  lastName: 'Guest',
  email: 'guest@example.com',
  phone: '5145550000',
  partySize: 8,
  bookingDate: '2026-12-09',
  slotId: 'dec-extra',
  slotStart: '16:30',
  slotEnd: '19:15',
  setupIntentId: 'seti_test',
};

describe('createBookingRequestSchema visitPurpose', () => {
  it.each(VISIT_PURPOSES)('accepts %s', (visitPurpose) => {
    expect(createBookingRequestSchema.safeParse({ ...base, visitPurpose }).success).toBe(true);
  });

  it('rejects a missing purpose', () => {
    expect(createBookingRequestSchema.safeParse(base).success).toBe(false);
  });

  // '' is the form's initial value, so a broken client gate would send exactly this.
  it.each(['', 'wedding', 'FAMILY_REUNION'])('rejects %j', (visitPurpose) => {
    expect(createBookingRequestSchema.safeParse({ ...base, visitPurpose }).success).toBe(false);
  });
});
