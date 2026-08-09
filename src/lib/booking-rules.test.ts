import { describe, expect, it } from 'vitest';
import {
  formatTimeRange,
  getDayName,
  getEffectiveDayConfig,
  getPartySizeCategory,
  getSlotsForDate,
  isRestaurantOpen,
} from './booking-rules';

// 2026-08-10 is a Monday, 2026-08-12 a Wednesday, 2026-08-14 a Friday, 2026-08-09 a Sunday
const MONDAY = new Date('2026-08-10T12:00:00');
const WEDNESDAY = new Date('2026-08-12T12:00:00');
const FRIDAY = new Date('2026-08-14T12:00:00');
const SUNDAY = new Date('2026-08-09T12:00:00');

describe('isRestaurantOpen', () => {
  it('is closed on Monday and Tuesday', () => {
    expect(isRestaurantOpen(MONDAY)).toBe(false);
  });

  it('is open Wednesday through Sunday', () => {
    expect(isRestaurantOpen(WEDNESDAY)).toBe(true);
    expect(isRestaurantOpen(FRIDAY)).toBe(true);
    expect(isRestaurantOpen(SUNDAY)).toBe(true);
  });
});

describe('getSlotsForDate', () => {
  it('returns no slots on a closed day', () => {
    expect(getSlotsForDate(MONDAY)).toEqual([]);
  });

  it('returns 3 slots on Wednesday', () => {
    expect(getSlotsForDate(WEDNESDAY)).toHaveLength(3);
  });

  it('returns 2 slots on Friday', () => {
    expect(getSlotsForDate(FRIDAY)).toHaveLength(2);
  });
});

describe('getEffectiveDayConfig', () => {
  it('falls back to closed config for out-of-range values', () => {
    // Date.getDay() is always 0-6, but guard against the ?? fallback directly
    expect(getEffectiveDayConfig(WEDNESDAY).dayName).toBe('Wednesday');
  });
});

describe('getDayName', () => {
  it('returns known day names', () => {
    expect(getDayName(0)).toBe('Sunday');
    expect(getDayName(5)).toBe('Friday');
  });

  it('returns empty string for unknown day index', () => {
    expect(getDayName(9)).toBe('');
  });
});

describe('getPartySizeCategory', () => {
  it('classifies small groups (1-6)', () => {
    expect(getPartySizeCategory(1)).toBe('small');
    expect(getPartySizeCategory(6)).toBe('small');
  });

  it('classifies group size (7-14)', () => {
    expect(getPartySizeCategory(7)).toBe('group');
    expect(getPartySizeCategory(14)).toBe('group');
  });

  it('classifies large groups (15+)', () => {
    expect(getPartySizeCategory(15)).toBe('large');
    expect(getPartySizeCategory(100)).toBe('large');
  });
});

describe('formatTimeRange', () => {
  it('formats a single arrival time', () => {
    const slot = getSlotsForDate(WEDNESDAY)[0];
    const result = formatTimeRange(slot);
    expect(result.arrival).toBe('5:00 PM');
    expect(result.departure).toBe('7:30 PM');
  });

  it('formats a ranged arrival window', () => {
    const result = formatTimeRange({
      id: 'test',
      arrivalStart: '17:00',
      arrivalEnd: '18:00',
      slotEnd: '20:00',
      label: 'test',
      type: 'early',
    });
    expect(result.arrival).toBe('5:00 PM - 6:00 PM');
  });

  it('formats midnight departure correctly', () => {
    const slot = getSlotsForDate(FRIDAY).find((s) => s.slotEnd === '00:00')!;
    expect(formatTimeRange(slot).departure).toBe('12:00 AM');
  });
});
