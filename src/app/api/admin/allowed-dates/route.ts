import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const allowDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET: Check if a date is in allowed_dates
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('allowed_dates')
      .select('*')
      .eq('date', date)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    return NextResponse.json({ 
      allowed: !!data,
      allowedDate: data 
    });
  } catch (error) {
    console.error('Error checking allowed date:', error);
    return NextResponse.json(
      { error: 'Failed to check allowed date' },
      { status: 500 }
    );
  }
}

// POST: Add a date to allowed_dates
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const body = await request.json();
    const result = allowDateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.issues },
        { status: 400 }
      );
    }

    const { date } = result.data;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('allowed_dates')
      .insert({ date });

    if (error) {
      if (error.code === '23505') { // Unique violation - already exists
        return NextResponse.json(
          { message: 'Date already allowed' },
          { status: 200 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Date allowed successfully' });
  } catch (error) {
    console.error('Error allowing date:', error);
    return NextResponse.json(
      { error: 'Failed to allow date' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a date from allowed_dates
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Missing date' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('allowed_dates')
      .delete()
      .eq('date', date);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Date removed from allowed list' });
  } catch (error) {
    console.error('Error removing allowed date:', error);
    return NextResponse.json(
      { error: 'Failed to remove allowed date' },
      { status: 500 }
    );
  }
}
