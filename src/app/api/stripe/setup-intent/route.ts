// API Route: Create Stripe SetupIntent
// POST /api/stripe/setup-intent

import { NextRequest, NextResponse } from 'next/server';
import { createSetupIntent } from '@/lib/stripe';
import { z } from 'zod';

const requestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  bookingDate: z.string().optional(),
  partySize: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { email, name, bookingDate, partySize } = validationResult.data;

    // Create SetupIntent with metadata
    const setupIntent = await createSetupIntent(email, name, {
      booking_date: bookingDate || '',
      party_size: partySize?.toString() || '',
    });

    // Only the client secret goes back. This route is unauthenticated and matches existing
    // Stripe customers by email, so returning the customer ID handed any caller the
    // identifier for someone else's saved card. The booking API resolves the customer and
    // payment method from the SetupIntent itself.
    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error('SetupIntent creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment setup' },
      { status: 500 }
    );
  }
}
