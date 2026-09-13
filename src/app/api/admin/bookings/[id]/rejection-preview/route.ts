import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { buildRejectionEmail } from '@/lib/email';
import { requireAuth } from '@/lib/auth';

// POST /api/admin/bookings/[id]/rejection-preview
// Renders the exact rejection email the guest would receive, without sending anything.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.error;
  }

  const { id } = await params;
  const { reason } = await request.json().catch(() => ({}));
  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Rejection preview error:', error);
    return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const { subject, html } = buildRejectionEmail(booking, reason.trim());
  return NextResponse.json({ to: booking.email, subject, html });
}
