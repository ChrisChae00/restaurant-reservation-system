'use client';

// Admin Dashboard - Booking Management
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Users, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { Booking, BookingStatus } from '@/types/booking';

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
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSuccess, setChargeSuccess] = useState<string | null>(null);

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

  useEffect(() => {
    fetchBookings();
  }, [dateFilter, statusFilter]);

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
        throw new Error(result.error || 'Failed to charge penalty');
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
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-48 bg-input border-gold/20"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48 bg-input border-gold/20">
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

        {/* Alerts */}
        {chargeError && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            {chargeError}
          </div>
        )}
        {chargeSuccess && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            {chargeSuccess}
          </div>
        )}

        {/* Bookings List */}
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
                            <Calendar className="h-4 w-4 text-gold" />
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
