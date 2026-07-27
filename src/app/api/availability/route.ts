// API Route: Check Availability
// POST /api/availability

import { NextRequest, NextResponse } from 'next/server';
import { getDayName, getEffectiveDayConfig } from '@/lib/booking-rules';
import { getAvailabilityForDate } from '@/lib/availability';
import { availabilityRequestSchema } from '@/lib/validations';
import { isWithin7Days, isDateAllowed } from '@/lib/booking-validation';

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

    // Check if restaurant is open (respects schedule overrides for transition dates)
    const dayRules = getEffectiveDayConfig(dateObj);
    if (!dayRules.isOpen) {
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
