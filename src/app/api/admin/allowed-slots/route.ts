import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const allowSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string(),
});

// GET: Check if a slot is allowed for additional bookings
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const slotId = searchParams.get('slotId');

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    
    // If slotId provided, check specific slot
    if (slotId) {
      const { data } = await supabase
        .from('allowed_slots')
        .select('*')
        .eq('date', date)
        .eq('slot_id', slotId)
        .single();

      return NextResponse.json({ 
        allowed: !!data,
        allowedSlot: data 
      });
    }
    
    // Otherwise get all allowed slots for the date
    const { data, error } = await supabase
      .from('allowed_slots')
      .select('slot_id')
      .eq('date', date);

    if (error) throw error;

    return NextResponse.json({ 
      allowedSlots: (data || []).map(row => row.slot_id)
    });
  } catch (error) {
    console.error('Error checking allowed slots:', error);
    return NextResponse.json(
      { error: 'Failed to check allowed slots' },
      { status: 500 }
    );
  }
}

// POST: Allow additional bookings on a slot
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const body = await request.json();
    const result = allowSlotSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.issues },
        { status: 400 }
      );
    }

    const { date, slotId } = result.data;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('allowed_slots')
      .insert({ date, slot_id: slotId });

    if (error) {
      if (error.code === '23505') { // Already exists
        return NextResponse.json(
          { message: 'Slot already allowed' },
          { status: 200 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Slot allowed for additional bookings' });
  } catch (error) {
    console.error('Error allowing slot:', error);
    return NextResponse.json(
      { error: 'Failed to allow slot' },
      { status: 500 }
    );
  }
}

// DELETE: Remove slot from allowed list (block additional bookings)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const slotId = searchParams.get('slotId');

    if (!date || !slotId) {
      return NextResponse.json(
        { error: 'Missing date or slotId' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('allowed_slots')
      .delete()
      .eq('date', date)
      .eq('slot_id', slotId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Slot removed from allowed list' });
  } catch (error) {
    console.error('Error removing allowed slot:', error);
    return NextResponse.json(
      { error: 'Failed to remove allowed slot' },
      { status: 500 }
    );
  }
}
