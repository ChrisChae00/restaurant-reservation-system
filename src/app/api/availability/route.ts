// API Route: Check Availability
// POST /api/availability

import { NextRequest, NextResponse } from 'next/server';
import { RESTAURANT_SCHEDULE, getDayName } from '@/lib/booking-rules';
import { getAvailabilityForDate } from '@/lib/availability';
import { availabilityRequestSchema } from '@/lib/validations';

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
