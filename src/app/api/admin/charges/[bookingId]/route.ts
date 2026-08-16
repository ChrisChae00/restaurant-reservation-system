// API Route: Poll charge attempt status for a booking
// GET /api/admin/charges/[bookingId]
//
// Proxies to the backend's GET /api/admin/charges/:bookingId (backend/src/routes/admin.ts).
// The backend's internal secret never reaches the browser -- this route holds it server-side
// and the admin dashboard polls this instead, the same way the charge-penalty route proxies
// the POST when CHARGE_VIA_BACKEND=true.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.error;
  }

  const backendUrl = process.env.BACKEND_URL;
  const secret = process.env.BACKEND_INTERNAL_SECRET;
  if (!backendUrl || !secret) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  }

  const { bookingId } = await params;

  const response = await fetch(`${backendUrl}/api/admin/charges/${bookingId}`, {
    headers: { 'x-internal-secret': secret },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
