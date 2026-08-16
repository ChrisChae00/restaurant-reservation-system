import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CAPACITY, getSlotsForDate, isRestaurantOpen } from '@/lib/booking-rules';
import { createServerClient } from '@/lib/supabase/server';

// The point of this suite is that the dining-room capacity rule holds against a direct
// API call, the path the admin UI's old warning-only banner could not cover. Only auth
// and email are stubbed; the occupancy count runs against real rows.
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ authenticated: true }),
}));

vi.mock('@/lib/email', () => ({
  sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));

const TEST_EMAIL_DOMAIN = '@capacitytest.example';

// Sun/Wed/Thu are the days whose early and mid seatings overlap, which is what this
// suite needs; Fri/Sat only have two non-overlapping slots.
//
// The offsets start past day 30 on purpose: the booking suites in ../../../bookings pick
// dates from days 8-30 and vitest runs test files in parallel, so a shared date would
// have these seeded rows occupying the slot those tests expect to find free.
function findOverlappingSlots() {
  for (let offset = 31; offset < 60; offset++) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    if (!isRestaurantOpen(date)) continue;
    const slots = getSlotsForDate(date);
    const early = slots.find((s) => s.type === 'early');
    const mid = slots.find((s) => s.type === 'mid');
    if (early && mid) return { date, early, mid };
  }
  throw new Error('No day with overlapping early/mid slots found in range');
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const { date: bookingDateObj, early, mid } = findOverlappingSlots();
const bookingDate = toDateOnlyString(bookingDateObj);

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  await supabase.from('bookings').delete().like('email', `%${TEST_EMAIL_DOMAIN}`);
}

function seedRow(label: string, partySize: number, start: string, end: string) {
  return {
    first_name: 'Capacity',
    last_name: label,
    email: `${label}${TEST_EMAIL_DOMAIN}`,
    phone: '5145551234',
    party_size: partySize,
    booking_date: bookingDate,
    slot_start: `${start}:00`,
    slot_end: `${end}:00`,
    stripe_customer_id: 'cus_capacity_test',
    stripe_payment_method_id: 'pm_capacity_test',
    status: 'confirmed' as const,
  };
}

function patch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  'PATCH /api/admin/bookings/[id] capacity',
  () => {
    const supabase = createServerClient();

    beforeEach(async () => {
      await cleanup(supabase);
    });

    afterEach(async () => {
      await cleanup(supabase);
    });

    // The neighbour sits in the *overlapping* mid slot, never the same slot as the row
    // being edited, so an exact-slot-match count would report zero others and let the
    // edit through. Both parties are in the room at 18:00.
    async function seedPair(neighbourSize: number, editedSize: number) {
      const { data, error } = await supabase
        .from('bookings')
        .insert([
          seedRow('neighbour', neighbourSize, mid.arrivalStart, mid.slotEnd),
          seedRow('edited', editedSize, early.arrivalStart, early.slotEnd),
        ])
        .select();

      if (error) throw error;
      const edited = data!.find((row) => row.last_name === 'edited')!;
      return edited;
    }

    it('rejects an edit that puts overlapping seatings over capacity', async () => {
      const neighbourSize = 14;
      const edited = await seedPair(neighbourSize, 10);
      const overCapacity = MAX_CAPACITY - neighbourSize + 1;

      const { PATCH } = await import('./route');
      const response = await PATCH(
        patch(edited.id, { party_size: overCapacity, updated_at: edited.updated_at }),
        { params: Promise.resolve({ id: edited.id }) }
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.capacityExceeded).toBe(true);
      expect(body.currentGuests).toBe(neighbourSize);
      expect(body.max).toBe(MAX_CAPACITY);

      const { data: unchanged } = await supabase
        .from('bookings')
        .select('party_size')
        .eq('id', edited.id)
        .single();
      expect(unchanged!.party_size).toBe(10);
    });

    it('saves the same edit once the admin confirms the overbooking', async () => {
      const neighbourSize = 14;
      const edited = await seedPair(neighbourSize, 10);
      const overCapacity = MAX_CAPACITY - neighbourSize + 1;

      const { PATCH } = await import('./route');
      const response = await PATCH(
        patch(edited.id, {
          party_size: overCapacity,
          updated_at: edited.updated_at,
          force_overbook: true,
        }),
        { params: Promise.resolve({ id: edited.id }) }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.booking.party_size).toBe(overCapacity);
      expect(body.booking.bypassed_slot_limit).toBe(true);
    });

    it('allows an edit that stays within capacity', async () => {
      const edited = await seedPair(14, 10);

      const { PATCH } = await import('./route');
      const response = await PATCH(
        patch(edited.id, { party_size: 12, updated_at: edited.updated_at }),
        { params: Promise.resolve({ id: edited.id }) }
      );

      expect(response.status).toBe(200);
      expect((await response.json()).booking.party_size).toBe(12);
    });
  }
);
