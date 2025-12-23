// API Route: Check Availability
// POST /api/availability

import { NextRequest, NextResponse } from 'next/server';
import { RESTAURANT_SCHEDULE, getDayName } from '@/lib/booking-rules';
import { getAvailabilityForDate } from '@/lib/availability';
import { availabilityRequestSchema } from '@/lib/validations';
import { createServerClient } from '@/lib/supabase/server';
import { addDays, startOfDay, isBefore } from 'date-fns';

/**
 * Check if a date is within the 7-day booking restriction window
 */
function isWithin7Days(dateStr: string): boolean {
  const today = startOfDay(new Date());
  const minDate = addDays(today, 7);
  const targetDate = new Date(dateStr + 'T12:00:00');
  return isBefore(targetDate, minDate);
}

/**
 * Check if a date is in the allowed_dates table (admin override)
 */
async function isDateAllowed(dateStr: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('allowed_dates')
    .select('id')
    .eq('date', dateStr)
    .single();
  
  return !!data;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validationResult = availabilityRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { date, partySize } = validationResult.data;

    // Parse date and get day of week
    const dateObj = new Date(date + 'T12:00:00'); // Noon to avoid timezone issues
    const dayOfWeek = dateObj.getDay();
    const dayName = getDayName(dayOfWeek);

    // Check if restaurant is open
    const dayRules = RESTAURANT_SCHEDULE[dayOfWeek];
    if (!dayRules || !dayRules.isOpen) {
      return NextResponse.json({
        date,
        partySize,
        slots: [],
        isOpen: false,
        dayName,
        message: `The restaurant is closed on ${dayName}s`,
      });
    }

    // Check 7-day rule: if date is within 7 days and NOT explicitly allowed
    const within7Days = isWithin7Days(date);
    if (within7Days) {
      const allowed = await isDateAllowed(date);
      if (!allowed) {
        return NextResponse.json({
          date,
          partySize,
          slots: [],
          isOpen: false,
          dayName,
          isBlocked7Day: true,
          message: 'Reservations must be made at least 7 days in advance',
        });
      }
      // If allowed, continue to check slot availability
    }

    // Get availability for fixed slots
    const slots = await getAvailabilityForDate(dateObj, partySize);

    return NextResponse.json({
      date,
      partySize,
      slots,
      isOpen: true,
      dayName,
    });
  } catch (error) {
    console.error('Availability check error:', error);
    return NextResponse.json(
      { error: 'Failed to check availability' },
      { status: 500 }
    );
  }
}
