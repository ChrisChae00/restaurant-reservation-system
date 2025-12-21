import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { format, startOfMonth, endOfMonth, addWeeks, addMonths, subDays, addDays } from 'date-fns';

export async function GET(request: NextRequest) {
  // Check authentication
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.error;
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  
  // Get parameters
  const monthStr = searchParams.get('month'); // format: 'yyyy-MM'
  const confirmedRange = searchParams.get('confirmedRange') || '2w';

  try {
    // Calculate date ranges - extend to include prev/next week for calendar display
    // Parse month correctly to avoid timezone issues
    let monthDate: Date;
    if (monthStr) {
      const [year, month] = monthStr.split('-').map(Number);
      monthDate = new Date(year, month - 1, 1); // month is 0-indexed
    } else {
      monthDate = new Date();
    }
    const monthStart = format(subDays(startOfMonth(monthDate), 7), 'yyyy-MM-dd');
    const monthEnd = format(addDays(endOfMonth(monthDate), 7), 'yyyy-MM-dd');

    const today = new Date();
    let confirmedEndDate: Date;
    switch (confirmedRange) {
      case '2w': confirmedEndDate = addWeeks(today, 2); break;
      case '1m': confirmedEndDate = addMonths(today, 1); break;
      case '2m': confirmedEndDate = addMonths(today, 2); break;
      case '3m': confirmedEndDate = addMonths(today, 3); break;
      default: confirmedEndDate = addWeeks(today, 2);
    }
    const confirmedStart = format(today, 'yyyy-MM-dd');
    const confirmedEnd = format(confirmedEndDate, 'yyyy-MM-dd');

    // Execute all queries in parallel
    const [pendingResult, monthStatsResult, confirmedResult] = await Promise.all([
      // 1. All pending bookings (for count, list, and stats)
      supabase
        .from('bookings')
        .select('*')
        .eq('status', 'pending')
        .order('booking_date', { ascending: true }),
      
      // 2. Month stats (confirmed bookings in the calendar view range)
      supabase
        .from('bookings')
        .select('booking_date, status, party_size')
        .gte('booking_date', monthStart)
        .lte('booking_date', monthEnd)
        .eq('status', 'confirmed'),
      
      // 3. Confirmed bookings within quick view range
      supabase
        .from('bookings')
        .select('*')
        .eq('status', 'confirmed')
        .gte('booking_date', confirmedStart)
        .lte('booking_date', confirmedEnd)
        .order('booking_date', { ascending: true })
    ]);

    // Check for errors
    if (pendingResult.error) throw pendingResult.error;
    if (monthStatsResult.error) throw monthStatsResult.error;
    if (confirmedResult.error) throw confirmedResult.error;

    // Process month stats - include both confirmed and pending
    const monthStats: Record<string, { pending: number; confirmed: number; group: number }> = {};
    
    // Add confirmed bookings to stats
    (monthStatsResult.data || []).forEach((booking: any) => {
      const dateStr = booking.booking_date;
      if (!monthStats[dateStr]) {
        monthStats[dateStr] = { pending: 0, confirmed: 0, group: 0 };
      }
      monthStats[dateStr].confirmed++;
      if (booking.party_size >= 7) monthStats[dateStr].group++;
    });
    
    // Add ALL pending bookings to stats (regardless of month)
    (pendingResult.data || []).forEach((booking: any) => {
      const dateStr = booking.booking_date;
      if (!monthStats[dateStr]) {
        monthStats[dateStr] = { pending: 0, confirmed: 0, group: 0 };
      }
      monthStats[dateStr].pending++;
    });

    return NextResponse.json({
      pendingBookings: pendingResult.data || [],
      pendingCount: (pendingResult.data || []).length,
      confirmedBookings: confirmedResult.data || [],
      monthStats,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
