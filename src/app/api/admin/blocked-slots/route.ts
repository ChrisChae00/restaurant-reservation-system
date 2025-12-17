import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const blockSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string(),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = blockSlotSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.issues },
        { status: 400 }
      );
    }

    const { date, slotId, reason } = result.data;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('blocked_slots')
      .insert({
        date,
        slot_id: slotId,
        reason,
      });

    if (error) {
      if (error.code === '23505') { // Unique violation
        return NextResponse.json(
            { message: 'Slot already blocked' },
            { status: 200 } // Idempotent success
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Slot blocked successfully' });
  } catch (error) {
    console.error('Error blocking slot:', error);
    return NextResponse.json(
      { error: 'Failed to block slot' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
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
      .from('blocked_slots')
      .delete()
      .eq('date', date)
      .eq('slot_id', slotId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Slot unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking slot:', error);
    return NextResponse.json(
      { error: 'Failed to unblock slot' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('blocked_slots')
      .select('*')
      .eq('date', date);

    if (error) throw error;

    return NextResponse.json({ blockedSlots: data });
  } catch (error) {
    console.error('Error fetching blocked slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blocked slots' },
      { status: 500 }
    );
  }
}
