import { describe, expect, it } from 'vitest';
import { validateBookingRules } from './booking-validation';

// Far enough ahead that the within-7-days check (which hits allowed_dates) never runs.
const NOW = new Date('2026-10-29T12:00:00');

describe('validateBookingRules: December 16:30 seating', () => {
  const decExtra = { slotId: 'dec-extra', slotStart: '16:30', slotEnd: '19:15', now: NOW };

  it('accepts dec-extra on a December open day', async () => {
    const result = await validateBookingRules({ ...decExtra, bookingDate: '2026-12-09' }); // Wednesday
    expect(result.ok && result.slot.id).toBe('dec-extra');
  });

  it('rejects dec-extra outside December', async () => {
    const result = await validateBookingRules({ ...decExtra, bookingDate: '2026-11-27' }); // Friday
    expect(!result.ok && result.failure.code).toBe('UNKNOWN_SLOT');
  });

  it('rejects dec-extra with tampered times', async () => {
    const result = await validateBookingRules({ ...decExtra, bookingDate: '2026-12-09', slotEnd: '20:00' });
    expect(!result.ok && result.failure.code).toBe('SLOT_TIME_MISMATCH');
  });
});
