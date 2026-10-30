import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { sendConfirmationEmail } from '@/lib/email';
import { recordEmailFailure, clearEmailFailure } from '@/lib/email-failure';
import { requireAuth } from '@/lib/auth';

// POST /api/admin/bookings/[id]/resend-confirmation
// Re-sends the confirmation email with the booking's current details. Kept separate from
// the edit (PATCH) route so saving an edit never emails the guest by itself — the admin
// sends once, after the edit is correct.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) {
      return auth.error;
    }

    const { id } = await params;
    const supabase = createServerClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Only confirmed bookings can be re-sent' }, { status: 400 });
    }

    try {
      await sendConfirmationEmail(booking);
    } catch (err) {
      console.error('Failed to resend confirmation email:', err);
      await recordEmailFailure(supabase, id, err);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
    }

    // The guest now has a correct email, so the earlier failure warning no longer applies.
    if (booking.last_email_error) {
      await clearEmailFailure(supabase, id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resend confirmation error:', error);
    return NextResponse.json({ error: 'Failed to resend confirmation email' }, { status: 500 });
  }
}
