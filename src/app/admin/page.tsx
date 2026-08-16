'use client';

// Admin Dashboard - Booking Management
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { 
  Users, 
  Calendar as CalendarIcon, 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Globe,
  LogOut,
  LayoutDashboard,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Booking, BookingStatus } from '@/types/booking';
import { getSlotsForDate, formatTimeRange } from '@/lib/booking-rules';
import { isWithin7Days as isDateWithin7Days } from '@/lib/restaurant-time';


const TIME_OPTIONS = Array.from({ length: 144 }, (_, i) =>
  `${String(Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`
);

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function nearestTimeOptionIndex(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Math.round(minutes / 10);
}

function TimeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const index = nearestTimeOptionIndex(value);
    if (index === null) return;
    // PopoverContent mounts into a portal a frame after `open` flips, so the ref
    // isn't attached yet on the frame this effect first runs.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => optionRefs.current[index]?.scrollIntoView({ block: 'center' }));
    });
  }, [open, value]);

  const displayValue = !focused && nearestTimeOptionIndex(value) !== null ? formatTime(value) : value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          type="text"
          placeholder="HH:MM"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => setFocused(false)}
        />
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1 max-h-40 overflow-y-auto z-[70]" align="start">
        {TIME_OPTIONS.map((t, i) => {
          const selected = t === value;
          return (
            <button
              key={t}
              ref={(el) => { optionRefs.current[i] = el; }}
              type="button"
              className={cn(
                'w-full text-left px-2 py-1 rounded text-sm hover:bg-gold/10',
                selected && 'bg-gold/20 text-gold font-medium'
              )}
              onClick={() => { onChange(t); setOpen(false); }}
            >
              {formatTime(t)}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

const statusColors: Record<BookingStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  noshow_charged: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const statusLabels: Record<BookingStatus, string> = {
  pending: '승인 대기',
  confirmed: '확정됨',
  cancelled: '취소됨',
  completed: '완료됨',
  noshow_charged: '노쇼 (청구됨)',
};

export default function AdminPage() {
  const router = useRouter();
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editForm, setEditForm] = useState<Partial<Booking>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateFilter = format(selectedDate, 'yyyy-MM-dd');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSuccess, setChargeSuccess] = useState<string | null>(null);
  
  // Quick View & Stats State
  const [showQuickView, setShowQuickView] = useState(false);
  const [quickViewData, setQuickViewData] = useState<{ pending: Booking[], confirmed: Booking[] }>({ pending: [], confirmed: [] });
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [monthStats, setMonthStats] = useState<Record<string, { pending: number, confirmed: number, group: number }>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [confirmedRangeFilter, setConfirmedRangeFilter] = useState<'2w' | '1m' | '2m' | '3m'>('2w');
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Availability Management State
  const [activeTab, setActiveTab] = useState<'bookings' | 'availability'>('bookings');
  const [blockedSlots, setBlockedSlots] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDateAllowed, setIsDateAllowed] = useState(false);
  const [slotBookings, setSlotBookings] = useState<Record<string, number>>({}); // slotId -> booking count
  const [allowedSlots, setAllowedSlots] = useState<Set<string>>(new Set()); // Slots that allow additional bookings

  // Charge Modal State
  const [chargeModalBooking, setChargeModalBooking] = useState<Booking | null>(null);
  const [chargeGuestCount, setChargeGuestCount] = useState<number>(0);
  const [useCustomAmount, setUseCustomAmount] = useState<boolean>(false);
  const [chargeCustomAmount, setChargeCustomAmount] = useState<string>('');

  // Logout handler
  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) {
      return;
    }
    
    setIsLoggingOut(true);
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      router.replace('/admin/login');
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoggingOut(false);
    }
  };


  const fetchBookings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/bookings?${params.toString()}`);
      const data = await response.json();
      setBookings(data.bookings || []);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBlockedSlots = async () => {
    setAvailabilityLoading(true);
    try {
      // Fetch blocked slots
      const response = await fetch(`/api/admin/blocked-slots?date=${dateFilter}`);
      const data = await response.json();
      if (data.blockedSlots) {
        setBlockedSlots(new Set(data.blockedSlots.map((s: any) => s.slot_id)));
      }
      
      // Also fetch if this date is allowed (for 7-day override)
      const allowedResponse = await fetch(`/api/admin/allowed-dates?date=${dateFilter}`);
      const allowedData = await allowedResponse.json();
      setIsDateAllowed(allowedData.allowed || false);
      
      // Fetch allowed slots (for additional bookings override)
      const allowedSlotsResponse = await fetch(`/api/admin/allowed-slots?date=${dateFilter}`);
      const allowedSlotsData = await allowedSlotsResponse.json();
      setAllowedSlots(new Set(allowedSlotsData.allowedSlots || []));
      
      // Fetch bookings for this date to show booking status
      const bookingsResponse = await fetch(`/api/bookings?date=${dateFilter}`);
      const bookingsData = await bookingsResponse.json();
      const bookingCounts: Record<string, number> = {};
      
      // Count bookings per slot (based on slot_start time)
      if (bookingsData.bookings) {
        const slots = getSlotsForDate(new Date(dateFilter + 'T12:00:00'));
        for (const slot of slots) {
          const slotStart = slot.arrivalStart + ':00'; // Normalize to HH:MM:SS
          const count = bookingsData.bookings.filter(
            (b: Booking) => b.slot_start === slotStart && ['pending', 'confirmed'].includes(b.status)
          ).length;
          bookingCounts[slot.id] = count;
        }
      }
      setSlotBookings(bookingCounts);
    } catch (error) {
      console.error('Failed to fetch blocked slots:', error);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'bookings') {
      fetchBookings();
    } else {
      fetchBlockedSlots();
    }
  }, [dateFilter, statusFilter, activeTab]);

  useEffect(() => {
    if (chargeSuccess || chargeError) {
      const timer = setTimeout(() => {
        setChargeSuccess(null);
        setChargeError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [chargeSuccess, chargeError]);

  // Fetch Dashboard Data (unified API)
  const fetchDashboardData = async (monthDate: Date = currentMonth, range: string = confirmedRangeFilter) => {
    setStatsLoading(true);
    try {
      const monthStr = format(monthDate, 'yyyy-MM');
      const response = await fetch(`/api/admin/dashboard?month=${monthStr}&confirmedRange=${range}`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      setMonthStats(data.monthStats || {});
      setPendingCount(data.pendingCount || 0);
      setQuickViewData({
        pending: data.pendingBookings || [],
        confirmed: data.confirmedBookings || []
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Initial load and month change
  useEffect(() => {
    fetchDashboardData(currentMonth, confirmedRangeFilter);
  }, [currentMonth]);

  // Update when Quick View opens or confirmed range changes
  useEffect(() => {
    if (showQuickView) {
      fetchDashboardData(currentMonth, confirmedRangeFilter);
    }
  }, [showQuickView, confirmedRangeFilter]);

  const handleToggleBlock = async (slotId: string, isCurrentlyBlocked: boolean) => {
    setChargeError(null);
    setChargeSuccess(null);
    const originalBlocked = new Set(blockedSlots);

    // Optimistic update
    const newBlocked = new Set(blockedSlots);
    if (isCurrentlyBlocked) {
      newBlocked.delete(slotId);
    } else {
      newBlocked.add(slotId);
    }
    setBlockedSlots(newBlocked);

    try {
      const method = isCurrentlyBlocked ? 'DELETE' : 'POST';
      const url = `/api/admin/blocked-slots${isCurrentlyBlocked ? `?date=${dateFilter}&slotId=${slotId}` : ''}`;
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: isCurrentlyBlocked ? undefined : JSON.stringify({
          date: dateFilter,
          slotId,
        }),
      });

      if (!response.ok) throw new Error('Failed to update slot status');

      setChargeSuccess(isCurrentlyBlocked ? 'Slot unblocked' : 'Slot blocked');
    } catch (error) {
      console.error('Block toggle error:', error);
      setChargeError('Failed to update slot status');
      setBlockedSlots(originalBlocked); // Revert
    }
  };

  // Toggle whether a date within 7 days is allowed for booking
  const handleToggleAllowDate = async () => {
    setChargeError(null);
    setChargeSuccess(null);
    const originalAllowed = isDateAllowed;
    
    // Optimistic update
    setIsDateAllowed(!isDateAllowed);
    
    try {
      const method = isDateAllowed ? 'DELETE' : 'POST';
      const url = isDateAllowed 
        ? `/api/admin/allowed-dates?date=${dateFilter}`
        : '/api/admin/allowed-dates';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: isDateAllowed ? undefined : JSON.stringify({ date: dateFilter }),
      });
      
      if (!response.ok) throw new Error('Failed to update allowed date');
      
      setChargeSuccess(isDateAllowed ? '예약 차단됨 (7일 규칙 적용)' : '예약 허용됨');
    } catch (error) {
      console.error('Allow date toggle error:', error);
      setChargeError('Failed to update allowed date status');
      setIsDateAllowed(originalAllowed); // Revert
    }
  };

  // Toggle whether a slot with existing bookings allows additional bookings
  const handleToggleAllowSlot = async (slotId: string, isCurrentlyAllowed: boolean) => {
    setChargeError(null);
    setChargeSuccess(null);
    const originalAllowed = new Set(allowedSlots);
    
    // Optimistic update
    const newAllowed = new Set(allowedSlots);
    if (isCurrentlyAllowed) {
      newAllowed.delete(slotId);
    } else {
      newAllowed.add(slotId);
    }
    setAllowedSlots(newAllowed);
    
    try {
      const method = isCurrentlyAllowed ? 'DELETE' : 'POST';
      const url = isCurrentlyAllowed 
        ? `/api/admin/allowed-slots?date=${dateFilter}&slotId=${slotId}`
        : '/api/admin/allowed-slots';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: isCurrentlyAllowed ? undefined : JSON.stringify({ date: dateFilter, slotId }),
      });
      
      if (!response.ok) throw new Error('Failed to update slot status');
      
      setChargeSuccess(isCurrentlyAllowed ? '추가 예약 차단됨' : '추가 예약 허용됨');
    } catch (error) {
      console.error('Allow slot toggle error:', error);
      setChargeError('Failed to update slot status');
      setAllowedSlots(originalAllowed); // Revert
    }
  };

  // Open charge modal
  const handleOpenChargeModal = (booking: Booking) => {
    setChargeModalBooking(booking);
    setChargeGuestCount(booking.party_size); // Default to full party
    setUseCustomAmount(false);
    setChargeCustomAmount('');
  };

  // Close charge modal
  const handleCloseChargeModal = () => {
    setChargeModalBooking(null);
    setChargeGuestCount(0);
    setUseCustomAmount(false);
    setChargeCustomAmount('');
  };

  // Polls the backend charge pipeline's status for a booking (via the /api/admin/charges
  // proxy) until the attempt reaches a terminal state or the timeout elapses. Only used
  // when the charge-penalty route responds 202 (CHARGE_VIA_BACKEND=true) -- the legacy
  // synchronous path already returns a final result directly.
  const pollChargeAttempt = async (
    bookingId: string,
    chargeAttemptId: string,
    timeoutMs = 30000
  ): Promise<{ status: string; amount_cents: number; guest_count: number; stripe_error_message: string | null } | null> => {
    const terminal = new Set(['succeeded', 'failed', 'requires_action', 'disputed', 'refunded']);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await fetch(`/api/admin/charges/${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        const attempt = data.attempts?.find((a: { id: string }) => a.id === chargeAttemptId);
        if (attempt && terminal.has(attempt.status)) {
          return attempt;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null; // still processing when we gave up polling -- not a failure
  };

  const handleChargePenalty = async () => {
    if (!chargeModalBooking) return;

    const bookingId = chargeModalBooking.id;
    setChargingId(bookingId);
    setChargeError(null);
    setChargeSuccess(null);
    handleCloseChargeModal();

    try {
      const response = await fetch('/api/admin/charge-penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          guestCount: chargeGuestCount,
          customAmount: useCustomAmount ? parseFloat(chargeCustomAmount) : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          (result.error && result.error.issues && result.error.issues[0]?.message) ||
          result.error ||
          '위약금 청구 실패'
        );
      }

      if (response.status === 202 && result.chargeAttemptId) {
        // Queued on the backend -- wait for it to settle instead of trusting an
        // in-flight status as a final answer.
        setChargeSuccess('청구 처리 중...');
        const attempt = await pollChargeAttempt(bookingId, result.chargeAttemptId);
        if (attempt?.status === 'succeeded') {
          setChargeSuccess(`$${(attempt.amount_cents / 100).toFixed(2)} CAD 청구 완료 (${attempt.guest_count}명)`);
        } else if (attempt) {
          setChargeError(`위약금 청구 실패: ${attempt.stripe_error_message ?? attempt.status}`);
        } else {
          setChargeSuccess('청구 처리 중입니다. 잠시 후 예약 상태를 확인해주세요.');
        }
      } else {
        setChargeSuccess(`$${result.chargedAmount} CAD 청구 완료 (${result.chargedGuestCount}명)`);
      }

      fetchBookings();
    } catch (error) {
      console.error('Charge error:', error);
      setChargeError(error instanceof Error ? error.message : '위약금 청구 실패');
    } finally {
      setChargingId(null);
    }
  };

  // 예약 취소 (청구 없이)
  const handleCancelBooking = async (bookingId: string, updatedAt?: string) => {
    if (!confirm('위약금 없이 이 예약을 취소하시겠습니까?')) {
      return;
    }

    setChargingId(bookingId);
    setChargeError(null);
    setChargeSuccess(null);

    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', updated_at: updatedAt }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || '예약 취소 실패');
      }

      setChargeSuccess('예약이 취소되었습니다 (청구 없음)');
      fetchBookings();
      fetchDashboardData(currentMonth, confirmedRangeFilter);
    } catch (error) {
      console.error('Cancel error:', error);
      setChargeError('예약 취소 실패');
    } finally {
      setChargingId(null);
    }
  };

  // 예약 확정 (pending -> confirmed)
  const handleConfirmBooking = async (bookingId: string, updatedAt?: string) => {
    if (!confirm('이 예약을 확정하시겠습니까? 손님에게 확정 이메일이 발송됩니다.')) {
      return;
    }

    setChargingId(bookingId);
    setChargeError(null);
    setChargeSuccess(null);

    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed', updated_at: updatedAt }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || '예약 확정 실패');
      }

      setChargeSuccess('예약이 확정되었습니다. 손님에게 이메일이 발송되었습니다.');
      fetchBookings();
      fetchDashboardData(currentMonth, confirmedRangeFilter);
    } catch (error) {
      console.error('Confirm error:', error);
      setChargeError('예약 확정 실패');
    } finally {
      setChargingId(null);
    }
  };

  const handleEditClick = (booking: Booking) => {
    setEditingBooking(booking);
    setEditForm({
      first_name: booking.first_name,
      last_name: booking.last_name,
      email: booking.email,
      phone: booking.phone,
      party_size: booking.party_size,
      booking_date: booking.booking_date,
      slot_start: booking.slot_start,
      slot_end: booking.slot_end,
      allergy_info: booking.allergy_info,
    });
  };

  const submitUpdate = async (force: boolean) => {
    if (!editingBooking) return;

    setIsUpdating(true);
    setChargeError(null);
    setChargeSuccess(null);

    try {
      const response = await fetch(`/api/admin/bookings/${editingBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          updated_at: editingBooking.updated_at,
          force_overbook: force,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);

        if (response.status === 409 && result?.conflict) {
          const summary = (result.conflicting_bookings as Booking[])
            .map((b) => `${b.first_name} ${b.last_name} (${b.party_size}명)`)
            .join(', ');
          if (window.confirm(`이미 이 시간대에 다음 예약이 있습니다: ${summary}\n그래도 진행하시겠습니까?`)) {
            await submitUpdate(true);
          }
          return;
        }

        // The server counts everyone seated at an overlapping time, so this total can be
        // higher than what the edited slot alone holds.
        if (response.status === 409 && result?.capacityExceeded) {
          const total = result.currentGuests + result.requested;
          if (window.confirm(
            `이 시간대 총 인원이 ${total}명으로 정원(${result.max}명)을 초과합니다.\n그래도 저장하시겠습니까?`
          )) {
            await submitUpdate(true);
          }
          return;
        }

        throw new Error(result?.error || 'Failed to update booking');
      }

      setChargeSuccess('예약이 수정되었습니다');
      setEditingBooking(null);
      fetchBookings();
      fetchDashboardData(currentMonth, confirmedRangeFilter);
    } catch (error) {
      console.error('Update error:', error);
      setChargeError(error instanceof Error ? error.message : '예약 수정 실패');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    submitUpdate(false);
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gold-light">관리자 대시보드</h1>
            <p className="text-sm sm:text-base text-muted-foreground">단체 예약 관리</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="border-gold/30 h-8 sm:h-9 text-xs sm:text-sm">
              <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">새로고침</span>
              <span className="sm:hidden">새로</span>
            </Button>
            <Button 
              onClick={handleLogout} 
              variant="outline" 
              size="sm"
              className="border-red-500/30 hover:bg-red-500/10 hover:text-red-400 h-8 sm:h-9 text-xs sm:text-sm"
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              )}
              <span className="hidden sm:inline">로그아웃</span>
              <span className="sm:hidden">로그</span>
            </Button>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 border border-gold/20 rounded-lg bg-secondary/20 backdrop-blur-sm">
           <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                 <Label className="whitespace-nowrap text-xs sm:text-sm text-muted-foreground">날짜</Label>
                 <Popover>
                   <PopoverTrigger asChild>
                     <Button
                       variant={"outline"}
                       size="sm"
                       className={cn(
                         "w-[140px] sm:w-[200px] pl-2 sm:pl-3 text-left font-normal border-gold/20 bg-input hover:bg-gold/5 h-8 sm:h-9 text-xs sm:text-sm",
                         !selectedDate && "text-muted-foreground"
                       )}
                     >
                       {selectedDate ? (
                         format(selectedDate, "MMM d, yyyy")
                       ) : (
                         <span>날짜 선택</span>
                       )}
                       <CalendarIcon className="ml-auto h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-50 text-gold" />
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-auto p-0" align="start">
                     <Calendar
                       mode="single"
                       selected={selectedDate}
                       defaultMonth={selectedDate}
                       onSelect={(date) => date && setSelectedDate(date)}
                       onMonthChange={(month) => {
                          setCurrentMonth(month);
                          fetchDashboardData(month, confirmedRangeFilter);
                        }}
                       initialFocus
                       className="p-3 pointer-events-auto"
                       classNames={{
                         head_cell: "text-muted-foreground font-normal text-xs w-10",
                         cell: "h-12 w-12 text-center text-sm p-0 flex items-center justify-center relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                         day: "h-10 w-10 p-0 font-normal aria-selected:opacity-100 hover:bg-gold/20 hover:text-gold rounded-full transition-all",
                         day_selected: "!bg-gold !text-background hover:!bg-gold-light hover:!text-background",
                         day_today: "bg-accent text-accent-foreground",
                       }}
                       components={{
                          DayButton: (props) => {
                             const { day, modifiers } = props;
                             const dateStr = format(day.date, 'yyyy-MM-dd');
                             const stat = monthStats[dateStr];
                             return (
                                <CalendarDayButton {...props} className="relative overflow-visible">
                                   <span className="z-10">{day.date.getDate()}</span>
                                   {stat && !modifiers.selected && (
                                      <div className="absolute bottom-1 w-full flex justify-center gap-0.5">
                                        {stat.pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" title={`${stat.pending} Pending`} />}
                                        {stat.group > 0 && <span className="h-1.5 w-1.5 rounded-full bg-purple-500" title={`${stat.group} Groups`} />}
                                      </div>
                                   )}
                                </CalendarDayButton>
                             );
                          }
                       }}
                     />
                   </PopoverContent>
                 </Popover>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                 <Label className="whitespace-nowrap text-xs sm:text-sm text-muted-foreground">상태</Label>
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                   <SelectTrigger className="w-[100px] sm:w-[150px] h-8 sm:h-9 bg-input border-gold/20 text-xs sm:text-sm">
                     <SelectValue placeholder="모든 상태" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">모든 상태</SelectItem>
                     <SelectItem value="pending">승인 대기</SelectItem>
                     <SelectItem value="confirmed">확정됨</SelectItem>
                     <SelectItem value="cancelled">취소됨</SelectItem>
                     <SelectItem value="completed">완료됨</SelectItem>
                     <SelectItem value="noshow_charged">노쇼 (청구됨)</SelectItem>
                   </SelectContent>
                 </Select>
              </div>
           </div>
           
           <Button 
             onClick={() => setShowQuickView(true)} 
             size="sm"
             className="bg-gold text-black hover:bg-gold-light h-8 sm:h-9 text-xs sm:text-sm w-full sm:w-auto relative"
           >
             <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
             예약 현황
             {pendingCount > 0 && (
               <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-md animate-pulse">
                 {pendingCount > 99 ? '99+' : pendingCount}
               </span>
             )}
           </Button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 sm:space-x-2 border-b border-gold/20 overflow-x-auto">
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
              activeTab === 'bookings'
                ? 'text-gold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            예약 목록
            {activeTab === 'bookings' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
              activeTab === 'availability'
                ? 'text-gold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="hidden sm:inline">예약 가능 시간 관리</span>
            <span className="sm:hidden">시간 관리</span>
            {activeTab === 'availability' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold" />
            )}
          </button>
        </div>


        {/* Floating Toast Notifications - Top Center */}
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-md px-4">
          {chargeError && (
            <div className="p-4 rounded-lg bg-red-600 text-white shadow-2xl border border-red-700 flex items-center justify-center gap-2 animate-in slide-in-from-top-2 fade-in duration-300 pointer-events-auto">
              <XCircle className="h-5 w-5 fill-white text-red-600" />
              <span className="font-medium">{chargeError}</span>
            </div>
          )}
          {chargeSuccess && (
            <div className="p-4 rounded-lg bg-emerald-600 text-white shadow-2xl border border-emerald-700 flex items-center justify-center gap-2 animate-in slide-in-from-top-2 fade-in duration-300 pointer-events-auto">
              <CheckCircle className="h-5 w-5 fill-white text-emerald-600" />
              <span className="font-medium">{chargeSuccess}</span>
            </div>
          )}
        </div>

        {/* Bookings List */}
        {activeTab === 'bookings' && (
        <Card className="glass-card border-gold/20">
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">예약 목록</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {bookings.length}건의 예약이 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            {loading ? (
              <div className="flex justify-center py-8 sm:py-12">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-gold" />
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground text-sm">
                선택한 필터에 해당하는 예약이 없습니다
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="border border-gold/20 rounded-lg p-3 sm:p-4 bg-secondary/30"
                  >
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-start sm:justify-between">
                      {/* Booking Info */}
                      <div className="space-y-1.5 sm:space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          <h3 className="font-semibold text-base sm:text-lg">
                            {booking.first_name} {booking.last_name}
                          </h3>
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs rounded-full border ${
                              statusColors[booking.status]
                            }`}
                          >
                            {statusLabels[booking.status]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4 text-gold" />
                            {format(new Date(booking.booking_date + 'T12:00:00'), 'MMM d')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-gold" />
                            {formatTime(booking.slot_start)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 sm:h-4 sm:w-4 text-gold" />
                            {booking.party_size}명
                          </span>
                        </div>
                        <div className="text-[10px] sm:text-sm text-muted-foreground break-words">
                          {booking.email} • {booking.phone}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] sm:text-sm text-muted-foreground" title="Preferred Language">
                          <Globe className="h-3 w-3 sm:h-4 sm:w-4 text-gold" />
                          <span>{booking.email_language === 'fr' ? 'Français' : 'English'}</span>
                        </div>
                        {booking.allergy_info && (
                          <div className="text-[10px] sm:text-sm text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
                            알러지: {booking.allergy_info}
                          </div>
                        )}
                        {booking.last_email_error && (
                          <div
                            className="text-[10px] sm:text-sm text-red-400 flex items-center gap-1"
                            title={booking.last_email_error}
                          >
                            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
                            이메일 발송 실패 (손님이 알림을 받지 못했을 수 있습니다)
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-end sm:justify-start">
                         <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(booking)}
                            className="border-gold/30 hover:border-gold h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                            title="수정"
                          >
                            수정
                          </Button>
                        
                        {booking.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleConfirmBooking(booking.id, booking.updated_at)}
                              disabled={chargingId === booking.id}
                              className="bg-green-600 hover:bg-green-700 text-white border-0 shadow-sm h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                              title="예약 확정"
                            >
                              {chargingId === booking.id ? (
                                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                              )}
                              확정
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelBooking(booking.id, booking.updated_at)}
                              disabled={chargingId === booking.id}
                              className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                              title="예약 취소"
                            >
                               {chargingId === booking.id ? (
                                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                              ) : (
                                "취소"
                              )}
                            </Button>
                          </>
                        )}

                        {booking.status === 'confirmed' && (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelBooking(booking.id, booking.updated_at)}
                              disabled={chargingId === booking.id}
                              className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                              title="취소 (청구 없음)"
                            >
                               {chargingId === booking.id ? (
                                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                              ) : (
                                "취소"
                              )}
                            </Button>
                            
                            <Button
                              size="sm"
                              onClick={() => handleOpenChargeModal(booking)}
                              disabled={chargingId === booking.id}
                              className="!bg-amber-500 !hover:bg-amber-600 !text-black border-0 font-medium shadow-sm h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                              title="노쇼 위약금 청구"
                            >
                              {chargingId === booking.id ? (
                                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin mr-0.5 sm:mr-1" />
                              ) : (
                                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                              )}
                              노쇼
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Availability Management */}
        {activeTab === 'availability' && (
          <Card className="glass-card border-gold/20">
            <CardHeader>
               <CardTitle>예약 가능 시간 관리</CardTitle>
               <CardDescription>{dateFilter} 의 시간대 차단/해제</CardDescription>
            </CardHeader>
            <CardContent>
               {availabilityLoading ? (
                  <div className="flex justify-center py-12">
                     <Loader2 className="h-8 w-8 animate-spin text-gold" />
                  </div>
               ) : (
                  <div className="space-y-4">
                     {/* 7-Day Rule Notice */}
                     {isDateWithin7Days(dateFilter) && (
                        <div className={`p-4 rounded-lg border flex items-center justify-between ${
                           isDateAllowed 
                             ? 'bg-green-500/10 border-green-500/30' 
                             : 'bg-amber-500/10 border-amber-500/30'
                        }`}>
                           <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                 <AlertTriangle className={`h-5 w-5 ${isDateAllowed ? 'text-green-400' : 'text-amber-400'}`} />
                                 <span className={`font-semibold ${isDateAllowed ? 'text-green-400' : 'text-amber-400'}`}>
                                    7일 이내 날짜
                                 </span>
                                 {isDateAllowed ? (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                                       예약 허용됨
                                    </span>
                                 ) : (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                       기본 차단
                                    </span>
                                 )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                 {isDateAllowed 
                                    ? '이 날짜는 특별히 예약이 허용되었습니다.' 
                                    : '손님은 7일 이내 날짜에 예약할 수 없습니다.'}
                              </p>
                           </div>
                           <Button
                              variant={isDateAllowed ? "destructive" : "outline"}
                              className={isDateAllowed 
                                 ? "bg-red-600 hover:bg-red-700 text-white"
                                 : "border-green-500/50 hover:bg-green-500/10 hover:text-green-400"}
                              onClick={handleToggleAllowDate}
                           >
                              {isDateAllowed ? (
                                 <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    예약 차단
                                 </>
                              ) : (
                                 <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    예약 허용
                                 </>
                              )}
                           </Button>
                        </div>
                     )}
                     
                     {getSlotsForDate(new Date(dateFilter + 'T12:00:00')).map((slot) => {
                        const isBlocked = blockedSlots.has(slot.id);
                        const times = formatTimeRange(slot);
                        const bookingCount = slotBookings[slot.id] || 0;
                        const isAutoBlocked = bookingCount > 0; // Auto-blocked due to existing booking
                        const isSlotAllowed = allowedSlots.has(slot.id); // Admin allowed additional bookings
                        const effectivelyBlocked = isBlocked || (isAutoBlocked && !isSlotAllowed);
                        
                        return (
                           <div key={slot.id} className="flex items-center justify-between p-4 border border-gold/20 rounded-lg bg-secondary/30">
                              <div className="space-y-1">
                                 <div className="flex items-center gap-2 flex-wrap">
                                     <span className="font-semibold text-lg">{times.arrival} - {times.departure}</span>
                                     {isAutoBlocked && (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                             {bookingCount}건 예약됨
                                         </span>
                                     )}
                                     {isBlocked && (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                                             수동 차단됨
                                         </span>
                                     )}
                                     {isSlotAllowed && (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                             추가 예약 허용
                                         </span>
                                     )}
                                     {effectivelyBlocked ? (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                             예약 불가
                                         </span>
                                     ) : (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                                             예약 가능
                                         </span>
                                     )}
                                 </div>
                                 <p className="text-sm text-muted-foreground">{slot.label} ({slot.type === 'early' ? '이른 시간' : slot.type === 'mid' ? '중간 시간' : '늦은 시간'})</p>
                              </div>
                              
                              <div className="flex gap-2">
                                 {/* Show allow additional booking button when auto-blocked */}
                                 {isAutoBlocked && (
                                    <Button
                                       variant="outline"
                                       size="sm"
                                       className={isSlotAllowed 
                                          ? "border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
                                          : "border-purple-500/50 hover:bg-purple-500/10 hover:text-purple-400"}
                                       onClick={() => handleToggleAllowSlot(slot.id, isSlotAllowed)}
                                    >
                                       {isSlotAllowed ? '추가 차단' : '추가 허용'}
                                    </Button>
                                 )}
                                 
                                 {/* Manual block/unblock button - only show when no bookings */}
                                 {!isAutoBlocked && (
                                    <Button
                                       variant={isBlocked ? "outline" : "destructive"}
                                       size="sm"
                                       className={isBlocked 
                                          ? "border-green-500/50 hover:bg-green-500/10 hover:text-green-400" 
                                          : "bg-red-600 hover:bg-red-700 text-white"}
                                       onClick={() => handleToggleBlock(slot.id, isBlocked)}
                                    >
                                       {isBlocked ? '차단 해제' : '시간대 차단'}
                                    </Button>
                                 )}
                              </div>
                           </div>
                        );
                     })}
                     
                     {getSlotsForDate(new Date(dateFilter + 'T12:00:00')).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                           이 날짜에 설정된 시간대가 없습니다 (휴무일?)
                        </div>
                     )}
                  </div>
               )}
            </CardContent>
          </Card>
        )}



        {/* Quick View Modal */}
        {showQuickView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
            <Card className="w-full max-w-5xl h-[90vh] sm:h-[80vh] flex flex-col bg-background border-gold/20 overflow-hidden shadow-2xl">
              <div className="flex justify-between items-center p-3 sm:p-6 border-b border-gold/10">
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 sm:h-5 sm:w-5 text-gold" />
                  <span className="hidden sm:inline">예약 현황</span>
                  <span className="sm:hidden">현황</span>
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowQuickView(false)} className="hover:bg-secondary h-8 w-8 sm:h-10 sm:w-10">
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
              
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Pending Section */}
                <div className="border-b md:border-b-0 md:border-r border-gold/10 flex flex-col h-1/2 md:h-full md:w-1/2 bg-yellow-500/5">
                  <div className="p-2 sm:p-4 border-b border-yellow-500/10 bg-yellow-500/10 flex justify-between items-center shrink-0">
                    <h3 className="font-semibold text-sm sm:text-lg text-yellow-500 flex items-center gap-1 sm:gap-2">
                      <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                      승인 대기 ({quickViewData.pending.length})
                    </h3>
                  </div>
                  <div className="p-2 sm:p-4 overflow-y-auto space-y-2 sm:space-y-3 flex-1">
                    {quickViewData.pending.length === 0 ? (
                      <div className="text-center py-6 sm:py-10 text-muted-foreground text-sm">대기 중인 예약이 없습니다.</div>
                    ) : (
                      quickViewData.pending.map(booking => (
                        <Card key={booking.id} className="border-yellow-500/20 bg-background/50">
                          <CardContent className="p-2 sm:p-3">
                            <div className="space-y-1.5 sm:space-y-2 mb-2 sm:mb-3">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-sm sm:text-base">{booking.first_name} {booking.last_name}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarIcon className="h-3 w-3 text-gold" />
                                  {format(parseISO(booking.booking_date), 'MMM d')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-gold" />
                                  {formatTime(booking.slot_start)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-gold" />
                                  {booking.party_size}명
                                </span>
                              </div>
                              <div className="text-[10px] sm:text-sm text-muted-foreground break-words">
                                {booking.email} • {booking.phone}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] sm:text-sm text-muted-foreground">
                                <Globe className="h-3 w-3 text-gold" />
                                <span>{booking.email_language === 'fr' ? 'Français' : 'English'}</span>
                              </div>
                              {booking.allergy_info && (
                                <div className="text-[10px] sm:text-sm text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  알러지: {booking.allergy_info}
                                </div>
                              )}
                            </div>
                            <div className="mt-2 sm:mt-3 flex justify-end gap-1 sm:gap-2">
                               <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 sm:h-7 text-[10px] sm:text-xs px-2 sm:px-3"
                                  onClick={() => handleEditClick(booking)}
                               >
                                  수정
                               </Button>
                               <Button
                                  size="sm"
                                  className="h-6 sm:h-7 text-[10px] sm:text-xs bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3"
                                  disabled={chargingId === booking.id}
                                  onClick={() => {
                                      handleConfirmBooking(booking.id, booking.updated_at);
                                  }}
                               >
                                  확정
                               </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>

                {/* Confirmed Section */}
                <div className="flex flex-col h-1/2 md:h-full md:w-1/2 bg-green-500/5">
                  <div className="p-2 sm:p-4 border-b border-green-500/10 bg-green-500/10 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold text-sm sm:text-lg text-green-500 flex items-center gap-1 sm:gap-2">
                        <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                        확정 예약 ({quickViewData.confirmed.length})
                      </h3>
                    </div>
                    <div className="flex gap-1 sm:gap-2 flex-wrap">
                      {(['2w', '1m', '2m', '3m'] as const).map((range) => (
                        <Button
                          key={range}
                          size="sm"
                          variant={confirmedRangeFilter === range ? 'default' : 'outline'}
                          className={`h-6 sm:h-7 text-[10px] sm:text-xs px-2 sm:px-3 ${confirmedRangeFilter === range ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-green-500/30 text-green-500 hover:bg-green-500/10'}`}
                          onClick={() => setConfirmedRangeFilter(range)}
                        >
                          {range === '2w' ? '2주' : range === '1m' ? '1개월' : range === '2m' ? '2개월' : '3개월'}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="p-2 sm:p-4 overflow-y-auto space-y-2 sm:space-y-3 flex-1">
                     {quickViewData.confirmed.length === 0 ? (
                      <div className="text-center py-6 sm:py-10 text-muted-foreground text-sm">확정된 예약이 없습니다.</div>
                    ) : (
                      quickViewData.confirmed.map(booking => (
                        <Card key={booking.id} className="border-green-500/20 bg-background/50">
                          <CardContent className="p-2 sm:p-3">
                            <div className="space-y-1.5 sm:space-y-2 mb-2 sm:mb-3">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-sm sm:text-base">{booking.first_name} {booking.last_name}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarIcon className="h-3 w-3 text-gold" />
                                  {format(parseISO(booking.booking_date), 'MMM d')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-gold" />
                                  {formatTime(booking.slot_start)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-gold" />
                                  {booking.party_size}명
                                </span>
                              </div>
                              <div className="text-[10px] sm:text-sm text-muted-foreground break-words">
                                {booking.email} • {booking.phone}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] sm:text-sm text-muted-foreground">
                                <Globe className="h-3 w-3 text-gold" />
                                <span>{booking.email_language === 'fr' ? 'Français' : 'English'}</span>
                              </div>
                              {booking.allergy_info && (
                                <div className="text-[10px] sm:text-sm text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  알러지: {booking.allergy_info}
                                </div>
                              )}
                            </div>
                            <div className="mt-2 sm:mt-3 flex justify-end gap-1 sm:gap-2">
                               <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-6 sm:h-7 text-[10px] sm:text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 px-2 sm:px-3"
                                  onClick={() => handleOpenChargeModal(booking)}
                               >
                                  노쇼
                               </Button>
                               <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 sm:h-7 text-[10px] sm:text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 px-2 sm:px-3"
                                  onClick={() => handleCancelBooking(booking.id, booking.updated_at)}
                               >
                                  취소
                               </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Edit Modal (Overlay) — stacks above Quick View (z-50) so 수정 works from within 승인 대기 */}
        {editingBooking && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <Card className="w-full max-w-lg bg-background border-gold/20 max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>예약 수정</CardTitle>
                <CardDescription>{editingBooking.first_name}님의 예약 정보 수정</CardDescription>
              </CardHeader>
              <form onSubmit={handleUpdateBooking}>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label>이름</Label>
                       <Input 
                         value={editForm.first_name || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, first_name: e.target.value}))} 
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>성</Label>
                       <Input 
                         value={editForm.last_name || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, last_name: e.target.value}))} 
                       />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>이메일</Label>
                       <Input 
                         value={editForm.email || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, email: e.target.value}))} 
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>전화번호</Label>
                       <Input 
                         value={editForm.phone || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, phone: e.target.value}))} 
                       />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                     <div className="space-y-2">
                       <Label>날짜</Label>
                       <Input
                         type="date"
                         value={editForm.booking_date?.toString() || ''}
                         onChange={(e) => setEditForm(prev => ({...prev, booking_date: e.target.value}))}
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>시작 시간</Label>
                       <TimeField
                         value={editForm.slot_start?.slice(0, 5) || ''}
                         onChange={(v) => setEditForm(prev => ({...prev, slot_start: v}))}
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>종료 시간</Label>
                       <TimeField
                         value={editForm.slot_end?.slice(0, 5) || ''}
                         onChange={(v) => setEditForm(prev => ({...prev, slot_end: v}))}
                       />
                    </div>
                  </div>

                   <div className="space-y-2">
                       <Label>인원수</Label>
                       <Input
                         type="number"
                         min={1}
                         value={editForm.party_size || ''}
                         onChange={(e) => setEditForm(prev => ({...prev, party_size: parseInt(e.target.value) || 0}))}
                       />
                    </div>

                    <div className="space-y-2">
                       <Label>알레르기</Label>
                       <Input 
                         value={editForm.allergy_info || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, allergy_info: e.target.value}))} 
                       />
                    </div>

                </CardContent>
                <div className="p-6 pt-0 flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setEditingBooking(null)}>취소</Button>
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    저장
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Charge Modal (Overlay) */}
        {chargeModalBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <Card className="w-full max-w-md bg-background border-gold/20">
              <CardHeader>
                <CardTitle>노쇼 위약금 청구</CardTitle>
                <CardDescription>
                  {chargeModalBooking.first_name} {chargeModalBooking.last_name}님의 예약
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground">예약 인원: <span className="text-foreground font-medium">{chargeModalBooking.party_size}명</span></p>
                  <p className="text-sm text-muted-foreground">위약금: <span className="text-foreground font-medium">$20 CAD / 인</span></p>
                </div>

                <div className="space-y-2">
                  <Label>청구 인원수</Label>
                  <Select 
                    value={chargeGuestCount.toString()} 
                    onValueChange={(val) => setChargeGuestCount(parseInt(val))}
                    disabled={useCustomAmount}
                  >
                    <SelectTrigger className="bg-input border-gold/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: chargeModalBooking.party_size }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num}명
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="useCustomAmount"
                    checked={useCustomAmount}
                    onChange={(e) => setUseCustomAmount(e.target.checked)}
                    className="rounded border-gold/30"
                  />
                  <Label htmlFor="useCustomAmount" className="text-sm cursor-pointer">직접 금액 입력 (테스트용)</Label>
                </div>

                {useCustomAmount && (
                  <div className="space-y-2">
                    <Label>청구 금액 (CAD)</Label>
                    <Input
                      type="number"
                      min="0.5"
                      step="0.01"
                      placeholder="예: 1"
                      value={chargeCustomAmount}
                      onChange={(e) => setChargeCustomAmount(e.target.value)}
                      className="bg-input border-gold/20"
                    />
                  </div>
                )}

                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-lg font-bold text-amber-400">
                    청구 예정 금액: ${useCustomAmount && chargeCustomAmount ? parseFloat(chargeCustomAmount) || 0 : chargeGuestCount * 20} CAD
                  </p>
                </div>
              </CardContent>
              <div className="p-6 pt-0 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={handleCloseChargeModal}>취소</Button>
                <Button 
                  onClick={handleChargePenalty}
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  청구하기
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
