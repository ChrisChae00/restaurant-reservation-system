'use client';

// Confirmation Step - Booking Success
import { useTranslations } from 'next-intl';
import { CheckCircle, CalendarDays, Clock, Users, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { ConfirmedBooking } from '@/types/booking';

interface ConfirmationStepProps {
  booking: ConfirmedBooking;
  onNewBooking: () => void;
}

export function ConfirmationStep({ booking, onNewBooking }: ConfirmationStepProps) {
  const t = useTranslations('confirmation');

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const dateObj = new Date(booking.date + 'T12:00:00');

  return (
    <Card className="glass-card border-gold/20 overflow-hidden">
      {/* Success Header */}
      <div className="bg-gradient-to-r from-gold/20 to-gold/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gold/20 ring-4 ring-gold/30">
          <CheckCircle className="h-10 w-10 text-gold" />
        </div>
        <CardTitle className="text-3xl text-gold-light mb-2">{t('title')}</CardTitle>
        <p className="text-foreground/80">{t('subtitle')}</p>
      </div>

      <CardContent className="p-6 space-y-6">
        {/* Confirmation Number */}
        <div className="text-center py-4 bg-secondary/50 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">{t('details.confirmationNumber')}</p>
          <p className="text-2xl font-mono font-bold text-gold tracking-wider">
            {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20">
              <CalendarDays className="h-6 w-6 text-gold" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('details.date')}</p>
              <p className="text-lg font-medium">{format(dateObj, 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20">
              <Clock className="h-6 w-6 text-gold" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('details.time')}</p>
              <p className="text-lg font-medium">
                {formatTime(booking.slotStart)} - {formatTime(booking.slotEnd)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20">
              <Users className="h-6 w-6 text-gold" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('details.guests')}</p>
              <p className="text-lg font-medium">{booking.partySize}</p>
            </div>
          </div>
        </div>

        {/* Pending Message */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Clock className="h-5 w-5 text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-400">{t('pendingMessage')}</p>
          </div>
        </div>

        {/* Email Confirmation */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-gold/10 border border-gold/20">
          <Mail className="h-5 w-5 text-gold mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gold-light">{t('emailSent')}</p>
            <p className="text-sm text-foreground">{booking.email}</p>
          </div>
        </div>

        {/* Reminders */}
        <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2 text-gold">
            <AlertCircle className="h-5 w-5" />
            {t('reminder')}
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-gold">•</span>
              {t('reminderItems.headcount')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold">•</span>
              {t('reminderItems.arrival')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold">•</span>
              {t('reminderItems.cancellation')}
            </li>
          </ul>
        </div>

        {/* New Reservation Button */}
        <Button
          variant="outline"
          className="w-full border-gold/30 hover:bg-gold/10"
          onClick={onNewBooking}
        >
          {t('newReservation')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
