'use client';

// Step 2: Details - Date, Time Slot, and Contact Information
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Clock, User, Mail, Phone, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isRestaurantOpen, formatTimeRange } from '@/lib/booking-rules';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import type { SlotAvailability } from '@/types/booking';

interface DetailsStepProps {
  partySize: number;
  date: Date | undefined;
  slotId: string;
  slotStart: string;
  slotEnd: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  onDateChange: (date: Date | undefined) => void;
  onSlotChange: (slotId: string, start: string, end: string) => void;
  onContactChange: (field: 'firstName' | 'lastName' | 'email' | 'phone', value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function DetailsStep({
  partySize,
  date,
  slotId,
  slotStart,
  slotEnd,
  firstName,
  lastName,
  email,
  phone,
  onDateChange,
  onSlotChange,
  onContactChange,
  onNext,
  onBack,
}: DetailsStepProps) {
  const t = useTranslations('details');
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const maxDate = addDays(today, 60);

  // Fetch availability when date changes
  // Fetch availability when date changes
  useEffect(() => {
    // Reset slots if no date is selected
    if (!date) {
      setSlots([]);
      return;
    }

    let isMounted = true;

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);
      // NOTE: Removed onSlotChange('', '', '') call to prevent infinite loop.
      // Resetting slot selection should be handled by the onDateChange handler in the parent or by the user picking a new slot.

      try {
        const dateStr = format(date, 'yyyy-MM-dd');
        const response = await fetch('/api/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr, partySize }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch availability');
        }

        const data = await response.json();
        
        if (isMounted) {
          if (!data.isOpen) {
            setError(data.message || t('date.closed'));
            setSlots([]);
          } else {
            setSlots(data.slots);
          }
        }
      } catch (err) {
        console.error('Error fetching availability:', err);
        if (isMounted) {
          setError('Unable to check availability');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAvailability();

    return () => {
      isMounted = false;
    };
  }, [date, partySize]); // Removed 't' and 'onSlotChange' to prevent loop

  const isDateDisabled = (dateToCheck: Date): boolean => {
    if (isBefore(dateToCheck, today)) return true;
    if (dateToCheck > maxDate) return true;
    if (!isRestaurantOpen(dateToCheck)) return true;
    return false;
  };

  const [emailTouched, setEmailTouched] = useState(false);

  // Email validation regex
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  
  const isEmailValid = isValidEmail(email);

  const isFormValid = 
    date && 
    slotId && 
    firstName.trim().length > 0 && 
    lastName.trim().length > 0 && 
    isEmailValid &&
    phone.length >= 10;

  return (
    <Card className="glass-card border-gold/20">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
          <CalendarDays className="h-8 w-8 text-gold" />
        </div>
        <CardTitle className="text-2xl text-gold-light">{t('title')}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Selection */}
        <div className="space-y-2">
          <Label className="text-base font-medium">{t('date.label')}</Label>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={onDateChange}
              disabled={isDateDisabled}
              className="rounded-lg border border-gold/20 bg-card p-3"
              classNames={{
                day_selected: 'bg-gold text-background hover:bg-gold-light',
                day_today: 'bg-accent text-accent-foreground',
                day_disabled: 'text-muted-foreground/40',
                day: 'hover:bg-gold/10 hover:text-gold transition-colors',
              }}
            />
          </div>
        </div>

        {/* Time Slot Selection */}
        {date && (
          <div className="space-y-3">
            <Label className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-gold" />
              {t('time.label')}
            </Label>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gold" />
              </div>
            ) : error ? (
              <div className="text-center py-4 text-amber-400">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p>{error}</p>
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No available slots for this date
              </div>
            ) : (
              <div className="grid gap-3">
                {slots.map((slot) => {
                  const times = formatTimeRange({
                    id: slot.slotId,
                    arrivalStart: slot.arrivalStart,
                    arrivalEnd: slot.arrivalEnd,
                    slotEnd: slot.slotEnd,
                    label: slot.label,
                    type: slot.type,
                  });
                  const isSelected = slotId === slot.slotId;

                  return (
                    <Button
                      key={slot.slotId}
                      variant={isSelected ? 'default' : 'outline'}
                      disabled={!slot.available}
                      onClick={() => onSlotChange(slot.slotId, slot.arrivalStart, slot.slotEnd)}
                      className={`h-auto py-6 px-4 w-full flex flex-col items-center gap-2 ${
                        isSelected
                          ? 'bg-gold text-background hover:bg-gold-light border-gold ring-1 ring-gold ring-offset-2 ring-offset-background'
                          : slot.available
                          ? 'border-gold/30 hover:border-gold hover:bg-gold/10'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                          {/* Arrival */}
                          <div className="flex flex-col items-start min-w-[30%]">
                            <span className="text-[10px] uppercase tracking-widest opacity-70 mb-1">{t('time.arrival')}</span>
                            <span className="text-xl font-medium tracking-tight">{times.arrival}</span>
                          </div>

                          {/* Arrow / duration */}
                          <div className="flex flex-col items-center flex-1 px-4">
                            <div className="h-[1px] w-full bg-current opacity-20 relative">
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-current opacity-40"></div>
                            </div>
                          </div>

                          {/* Departure */}
                          <div className="flex flex-col items-end min-w-[30%]">
                            <span className="text-[10px] uppercase tracking-widest opacity-70 mb-1">{t('time.departure')}</span>
                            <span className="text-xl font-medium tracking-tight">{times.departure}</span>
                          </div>
                      </div>

                      {!slot.available && (
                        <div className="text-xs text-destructive font-medium mt-1">Fully Booked</div>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Late arrival warning */}
            {slotId && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('time.lateWarning')}
              </p>
            )}
          </div>
        )}

        {/* Contact Information */}
        {slotId && (
          <div className="space-y-4 pt-4 border-t border-gold/10">
            <Label className="text-base font-medium">{t('contact.title')}</Label>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="flex items-center gap-1 text-sm">
                  <User className="h-3 w-3 text-gold" />
                  {t('contact.firstName')}
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => onContactChange('firstName', e.target.value)}
                  placeholder={t('contact.firstNamePlaceholder')}
                  className="bg-input border-gold/20 focus:border-gold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm">
                  {t('contact.lastName')}
                </Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => onContactChange('lastName', e.target.value)}
                  placeholder={t('contact.lastNamePlaceholder')}
                  className="bg-input border-gold/20 focus:border-gold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1 text-sm">
                <Mail className="h-3 w-3 text-gold" />
                {t('contact.email')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => onContactChange('email', e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder={t('contact.emailPlaceholder')}
                className={`bg-input border-gold/20 focus:border-gold ${
                  emailTouched && !isEmailValid ? 'border-destructive focus:border-destructive' : ''
                }`}
              />
              {emailTouched && !isEmailValid && (
                <p className="text-xs text-destructive animate-in fade-in slide-in-from-top-1">
                  Please enter a valid email address
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-1 text-sm">
                <Phone className="h-3 w-3 text-gold" />
                {t('contact.phone')}
              </Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={phone}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  onContactChange('phone', value);
                }}
                placeholder={t('contact.phonePlaceholder')}
                className="bg-input border-gold/20 focus:border-gold"
              />
            </div>

            <p className="text-xs text-muted-foreground text-center pt-2">
              {t('depositNotice')}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 border-gold/30"
          >
            ← {t('back')}
          </Button>
          <Button
            onClick={onNext}
            disabled={!isFormValid}
            className="flex-1 bg-gold text-background hover:bg-gold-light"
          >
            {t('continue')} →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
