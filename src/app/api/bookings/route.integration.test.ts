import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSlotsForDate, isRestaurantOpen } from '@/lib/booking-rules';
import { createServerClient } from '@/lib/supabase/server';

vi.mock('@/lib/stripe', () => ({
  verifySetupIntent: vi.fn().mockResolvedValue({
    customerId: 'cus_integration_test',
    paymentMethodId: 'pm_integration_test',
  }),
}));

vi.mock('@/lib/email', () => ({
  sendNewReservationNotification: vi.fn().mockResolvedValue(undefined),
  sendReservationReceivedEmail: vi.fn().mockResolvedValue(undefined),
}));

const TEST_EMAIL_DOMAIN = '@integrationtest.example';

function findTestSlot(dayType: 'weekday' | 'weekend' = 'weekday') {
  for (let offset = 15; offset < 30; offset++) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    if (isRestaurantOpen(date)) {
      const isWeekend = date.getDay() === 5 || date.getDay() === 6; // Friday or Saturday
      if ((dayType === 'weekend' && isWeekend) || (dayType === 'weekday' && !isWeekend)) {
        const slots = getSlotsForDate(date);
        return { date, slots };
      }
    }
  }
  throw new Error('No open day found in range');
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
}

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)('POST /api/bookings integration', () => {
  const supabase = createServerClient();

  beforeEach(async () => {
    await cleanup(supabase);
  });

  afterEach(async () => {
    await cleanup(supabase);
  });

  it('rejects overlapping or forged time slots', async () => {
    const { POST } = await import('./route');
    const { date, slots } = findTestSlot('weekday');
    const bookingDate = toDateOnlyString(date);
    const validSlot = slots[0];

    // Forged slot times that overlap but are not the canonical times
    const req = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'Overlap',
        email: `overlap${TEST_EMAIL_DOMAIN}`,
        phone: '5145551234',
        partySize: 8,
        bookingDate,
        slotId: validSlot.id,
        slotStart: '17:15', // Invalid forged start time
        slotEnd: '19:45',   // Invalid forged end time
        setupIntentId: 'seti_test',
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no longer valid|not available/i);
  });

  it('allows cancel-then-rebook for the same slot', async () => {
    const { POST } = await import('./route');
    const { date, slots } = findTestSlot('weekday');
    const bookingDate = toDateOnlyString(date);
    const slot = slots[0];

    // 1. Create initial booking
    const req1 = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'Cancel1',
        email: `cancel1${TEST_EMAIL_DOMAIN}`,
        phone: '5145551234',
        partySize: 8,
        bookingDate,
        slotId: slot.id,
        slotStart: slot.arrivalStart,
        slotEnd: slot.slotEnd,
        setupIntentId: 'seti_test',
      }),
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // 2. Mark as cancelled in DB
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .like('email', `cancel1${TEST_EMAIL_DOMAIN}`);

    // 3. Attempt to rebook the same slot
    const req2 = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'Cancel2',
        email: `cancel2${TEST_EMAIL_DOMAIN}`,
        phone: '5145551234',
        partySize: 8,
        bookingDate,
        slotId: slot.id,
        slotStart: slot.arrivalStart,
        slotEnd: slot.slotEnd,
        setupIntentId: 'seti_test',
      }),
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(200); // Should succeed since the previous is cancelled
  });

  it('correctly handles closing-hour boundaries (midnight departure)', async () => {
    const { POST } = await import('./route');
    // Find a Friday or Saturday which has a late slot ending at '00:00'
    const { date, slots } = findTestSlot('weekend');
    const bookingDate = toDateOnlyString(date);
    const lateSlot = slots.find(s => s.slotEnd === '00:00');
    
    expect(lateSlot).toBeDefined();

    const req = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'Midnight',
        email: `midnight${TEST_EMAIL_DOMAIN}`,
        phone: '5145551234',
        partySize: 8,
        bookingDate,
        slotId: lateSlot!.id,
        slotStart: lateSlot!.arrivalStart,
        slotEnd: lateSlot!.slotEnd,
        setupIntentId: 'seti_test',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
