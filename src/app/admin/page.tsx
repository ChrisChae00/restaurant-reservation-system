'use client';

// Admin Dashboard - Booking Management
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { getSlotsForDate, TimeSlot, formatTimeRange } from '@/lib/booking-rules';


const statusColors: Record<BookingStatus, string> = {
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  noshow_charged: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const statusLabels: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  noshow_charged: 'No-Show (Charged)',
};

export default function AdminPage() {
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

  // Availability Management State
  const [activeTab, setActiveTab] = useState<'bookings' | 'availability'>('bookings');
  const [blockedSlots, setBlockedSlots] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);


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
      const response = await fetch(`/api/admin/blocked-slots?date=${dateFilter}`);
      const data = await response.json();
      if (data.blockedSlots) {
        setBlockedSlots(new Set(data.blockedSlots.map((s: any) => s.slot_id)));
      }
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

  const handleChargePenalty = async (bookingId: string) => {
    if (!confirm('Are you sure you want to charge the no-show penalty for this booking?')) {
      return;
    }

    setChargingId(bookingId);
    setChargeError(null);
    setChargeSuccess(null);

    try {
      const response = await fetch('/api/admin/charge-penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          (result.error && result.error.issues && result.error.issues[0]?.message) ||
          result.error ||
          'Failed to charge penalty'
        );
      }

      setChargeSuccess(`Successfully charged $${result.chargedAmount} CAD`);
      fetchBookings(); // Refresh list
    } catch (error) {
      console.error('Charge error:', error);
      setChargeError(error instanceof Error ? error.message : 'Failed to charge penalty');
    } finally {
      setChargingId(null);
    }
  };

  // Cancel without charge
  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking WITHOUT charging penalty?')) {
      return;
    }

    setChargingId(bookingId); // Use chargingId for loading state
    setChargeError(null);
    setChargeSuccess(null);

    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel booking');
      }

      setChargeSuccess('Booking cancelled successfully (No charge)');
      fetchBookings();
    } catch (error) {
      console.error('Cancel error:', error);
      setChargeError('Failed to cancel booking');
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

  const handleUpdateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;

    setIsUpdating(true);
    setChargeError(null);
    setChargeSuccess(null);

    try {
      const response = await fetch(`/api/admin/bookings/${editingBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) {
        throw new Error('Failed to update booking');
      }

      setChargeSuccess('Booking updated successfully');
      setEditingBooking(null);
      fetchBookings();
    } catch (error) {
      console.error('Update error:', error);
      setChargeError('Failed to update booking');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gold-light">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage group reservations</p>
          </div>
          <Button onClick={fetchBookings} variant="outline" className="border-gold/30">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card className="glass-card border-gold/20">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <div className="space-y-2 flex flex-col">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-[240px] pl-3 text-left font-normal border-gold/20 bg-input hover:bg-gold/5",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      {selectedDate ? (
                        format(selectedDate, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50 text-gold" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      classNames={{
                        head_cell: "text-muted-foreground font-normal text-xs w-10",
                        cell: "h-12 w-12 text-center text-sm p-0 flex items-center justify-center relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                        day: "h-10 w-10 p-0 font-normal aria-selected:opacity-100 hover:bg-gold/20 hover:text-gold rounded-full transition-all",
                        day_selected: "!bg-gold !text-background hover:!bg-gold-light hover:!text-background",
                        day_today: "bg-accent text-accent-foreground",
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[200px] bg-input border-gold/20">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="noshow_charged">No-Show (Charged)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-gold/20">
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'bookings'
                ? 'text-gold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Bookings
            {activeTab === 'bookings' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'availability'
                ? 'text-gold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Availability Block
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
          <CardHeader>
            <CardTitle>Bookings</CardTitle>
            <CardDescription>
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gold" />
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No bookings found for the selected filters
              </div>
            ) : (
              <div className="space-y-4">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="border border-gold/20 rounded-lg p-4 bg-secondary/30"
                  >
                    <div className="flex flex-wrap gap-4 items-start justify-between">
                      {/* Booking Info */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">
                            {booking.first_name} {booking.last_name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full border ${
                              statusColors[booking.status]
                            }`}
                          >
                            {statusLabels[booking.status]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-4 w-4 text-gold" />
                            {format(new Date(booking.booking_date + 'T12:00:00'), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-gold" />
                            {formatTime(booking.slot_start)} - {formatTime(booking.slot_end)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-gold" />
                            {booking.party_size} guests
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {booking.email} • {booking.phone}
                        </div>
                        {booking.allergy_info && (
                          <div className="text-sm text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            Allergies: {booking.allergy_info}
                          </div>
                        )}
                        {booking.penalty_amount && (
                          <div className="text-sm text-green-400">
                            Penalty charged: ${booking.penalty_amount / 100} CAD
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 items-center">
                         <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(booking)}
                            className="border-gold/30 hover:border-gold"
                            title="Edit"
                          >
                            Edit
                          </Button>
                        
                        {booking.status === 'confirmed' && (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelBooking(booking.id)}
                              disabled={chargingId === booking.id}
                              className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
                              title="Cancel without Charge"
                            >
                               {chargingId === booking.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Cancel"
                              )}
                            </Button>
                            
                            <Button
                              size="sm"
                              onClick={() => handleChargePenalty(booking.id)}
                              disabled={chargingId === booking.id}
                              className="!bg-amber-500 !hover:bg-amber-600 !text-black border-0 font-medium shadow-sm"
                              title="Charge Penalty"
                            >
                              {chargingId === booking.id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <DollarSign className="h-4 w-4 mr-1" />
                              )}
                              No-Show (Charge)
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
               <CardTitle>Manage Availability</CardTitle>
               <CardDescription>Block or unblock time slots for {dateFilter}</CardDescription>
            </CardHeader>
            <CardContent>
               {availabilityLoading ? (
                  <div className="flex justify-center py-12">
                     <Loader2 className="h-8 w-8 animate-spin text-gold" />
                  </div>
               ) : (
                  <div className="space-y-4">
                     {getSlotsForDate(new Date(dateFilter + 'T12:00:00')).map((slot) => {
                        const isBlocked = blockedSlots.has(slot.id);
                        const times = formatTimeRange(slot);
                        
                        return (
                           <div key={slot.id} className="flex items-center justify-between p-4 border border-gold/20 rounded-lg bg-secondary/30">
                              <div className="space-y-1">
                                 <div className="flex items-center gap-2">
                                     <span className="font-semibold text-lg">{times.arrival} - {times.departure}</span>
                                     {isBlocked && (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                                             Blocked
                                         </span>
                                     )}
                                     {!isBlocked && (
                                         <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                                             Available
                                         </span>
                                     )}
                                 </div>
                                 <p className="text-sm text-muted-foreground">{slot.label} ({slot.type})</p>
                              </div>
                              
                              <Button
                                 variant={isBlocked ? "outline" : "destructive"}
                                 className={isBlocked 
                                    ? "border-green-500/50 hover:bg-green-500/10 hover:text-green-400" 
                                    : "bg-red-600 hover:bg-red-700 text-white"}
                                 onClick={() => handleToggleBlock(slot.id, isBlocked)}
                              >
                                 {isBlocked ? (
                                    <>
                                       <CheckCircle className="mr-2 h-4 w-4" />
                                       Unblock
                                    </>
                                 ) : (
                                    <>
                                       <XCircle className="mr-2 h-4 w-4" />
                                       Block Slot
                                    </>
                                 )}
                              </Button>
                           </div>
                        );
                     })}
                     
                     {getSlotsForDate(new Date(dateFilter + 'T12:00:00')).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                           No slots configured for this day (Restaurant Closed?)
                        </div>
                     )}
                  </div>
               )}
            </CardContent>
          </Card>
        )}


        {/* Edit Modal (Overlay) */}
        {editingBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <Card className="w-full max-w-lg bg-background border-gold/20 max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Edit Booking</CardTitle>
                <CardDescription>Update booking details for {editingBooking.first_name}</CardDescription>
              </CardHeader>
              <form onSubmit={handleUpdateBooking}>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label>First Name</Label>
                       <Input 
                         value={editForm.first_name || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, first_name: e.target.value}))} 
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>Last Name</Label>
                       <Input 
                         value={editForm.last_name || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, last_name: e.target.value}))} 
                       />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>Email</Label>
                       <Input 
                         value={editForm.email || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, email: e.target.value}))} 
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>Phone</Label>
                       <Input 
                         value={editForm.phone || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, phone: e.target.value}))} 
                       />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                     <div className="space-y-2">
                       <Label>Date</Label>
                       <Input 
                         type="date"
                         value={editForm.booking_date?.toString() || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, booking_date: e.target.value}))} 
                       />
                    </div>
                     <div className="space-y-2">
                       <Label>Start Time</Label>
                       <Input 
                         type="time"
                         value={editForm.slot_start || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, slot_start: e.target.value}))} 
                       />
                    </div>
                    <div className="space-y-2">
                       <Label>End Time</Label>
                       <Input 
                         type="time"
                         value={editForm.slot_end || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, slot_end: e.target.value}))} 
                       />
                    </div>
                  </div>

                   <div className="space-y-2">
                       <Label>Party Size</Label>
                       <Input 
                         type="number"
                         value={editForm.party_size || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, party_size: parseInt(e.target.value) || 0}))} 
                       />
                    </div>

                    <div className="space-y-2">
                       <Label>Allergies</Label>
                       <Input 
                         value={editForm.allergy_info || ''} 
                         onChange={(e) => setEditForm(prev => ({...prev, allergy_info: e.target.value}))} 
                       />
                    </div>

                </CardContent>
                <div className="p-6 pt-0 flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setEditingBooking(null)}>Cancel</Button>
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
