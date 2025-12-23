'use client';

// Main 6-Step Booking Form Orchestrator
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  LandingStep,
  DetailsStep,
  MenuPolicyStep,
  AllergyStep,
  HouseRulesStep,
  CardGuaranteeStep,
  ConfirmationStep,
} from './steps';
import { BOOKING_STEPS, type BookingStep, type ConfirmedBooking, type EmailLanguage } from '@/types/booking';
import { format } from 'date-fns';

interface FormData {
  // Step 1
  partySize: number;
  agreedToRules: boolean;
  // Step 2
  date: Date | undefined;
  slotId: string;
  slotStart: string;
  slotEnd: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailLanguage: EmailLanguage;
  // Step 3
  acceptedMenuPolicy: boolean;
  // Step 4
  hasAllergies: boolean;
  allergyInfo: string;
  // Step 5
  acceptedHouseRules: boolean;
  // Step 6
  acceptedCancellationPolicy: boolean;
}

const initialFormData: FormData = {
  partySize: 0,
  agreedToRules: false,
  date: undefined,
  slotId: '',
  slotStart: '',
  slotEnd: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  emailLanguage: 'en',
  acceptedMenuPolicy: false,
  hasAllergies: false,
  allergyInfo: '',
  acceptedHouseRules: false,
  acceptedCancellationPolicy: false,
};

export function BookingForm() {
  const t = useTranslations('common');
  const [step, setStep] = useState<BookingStep | 'confirmation'>('landing');
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Step navigation
  const currentStepIndex = BOOKING_STEPS.indexOf(step as BookingStep);

  const goToStep = (newStep: BookingStep) => {
    setStep(newStep);
    setSubmitError(null);
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < BOOKING_STEPS.length) {
      goToStep(BOOKING_STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(BOOKING_STEPS[prevIndex]);
    }
  };

  // Form data handlers
  const updateFormData = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Final submission
  const handleSubmit = async (stripeCustomerId: string, stripePaymentMethodId: string) => {
    if (!formData.date) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          partySize: formData.partySize,
          bookingDate: format(formData.date, 'yyyy-MM-dd'),
          slotId: formData.slotId,
          slotStart: formData.slotStart,
          slotEnd: formData.slotEnd,
          allergyInfo: formData.hasAllergies ? formData.allergyInfo : null,
          emailLanguage: formData.emailLanguage,
          stripeCustomerId,
          stripePaymentMethodId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create booking');
      }

      setConfirmedBooking({
        id: result.booking.id,
        firstName: result.booking.firstName,
        lastName: result.booking.lastName,
        email: result.booking.email,
        partySize: result.booking.partySize,
        date: result.booking.date,
        slotStart: result.booking.slotStart,
        slotEnd: result.booking.slotEnd,
      });
      setStep('confirmation');
    } catch (error) {
      console.error('Booking error:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewBooking = () => {
    setStep('landing');
    setFormData(initialFormData);
    setConfirmedBooking(null);
    setSubmitError(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress Bar */}
      {/* Progress Bar */}
      {step !== 'confirmation' && (
        <div className="mb-8 space-y-2">
          {/* Segmented Bar */}
          <div className="flex gap-1.5 h-1.5 w-full">
            {BOOKING_STEPS.map((_, index) => {
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              
              return (
                <div
                  key={index}
                  className={`flex-1 rounded-full transition-all duration-500 relative ${
                    isCompleted ? 'bg-gold' : isActive ? 'bg-gold' : 'bg-gold/20'
                  }`}
                >
                  {/* Glow effect for active step */}
                  {isActive && (
                    <div className="absolute inset-0 bg-gold blur-[2px] opacity-60 animate-pulse rounded-full" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Label */}
          <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">
             <span>Step {currentStepIndex + 1}</span>
             <span>Total {BOOKING_STEPS.length}</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {submitError && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          {submitError}
        </div>
      )}

      {/* Step Content */}
      {step === 'landing' && (
        <LandingStep
          partySize={formData.partySize}
          agreedToRules={formData.agreedToRules}
          onPartySizeChange={(size) => updateFormData('partySize', size)}
          onAgreementChange={(agreed) => updateFormData('agreedToRules', agreed)}
          onNext={handleNext}
        />
      )}

      {step === 'details' && (
        <DetailsStep
          partySize={formData.partySize}
          date={formData.date}
          slotId={formData.slotId}
          slotStart={formData.slotStart}
          slotEnd={formData.slotEnd}
          firstName={formData.firstName}
          lastName={formData.lastName}
          email={formData.email}
          phone={formData.phone}
          emailLanguage={formData.emailLanguage}
          onDateChange={(date) => {
            updateFormData('date', date);
            // Reset slot selection when date changes to prevent selecting unavailable slots
            updateFormData('slotId', '');
            updateFormData('slotStart', '');
            updateFormData('slotEnd', '');
          }}
          onSlotChange={(id, start, end) => {
            updateFormData('slotId', id);
            updateFormData('slotStart', start);
            updateFormData('slotEnd', end);
          }}
          onContactChange={(field, value) => updateFormData(field, value)}
          onEmailLanguageChange={(lang) => updateFormData('emailLanguage', lang)}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 'menu-policy' && (
        <MenuPolicyStep
          acceptedMenuPolicy={formData.acceptedMenuPolicy}
          onAcceptChange={(accepted) => updateFormData('acceptedMenuPolicy', accepted)}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 'allergy' && (
        <AllergyStep
          hasAllergies={formData.hasAllergies}
          allergyInfo={formData.allergyInfo}
          onHasAllergiesChange={(has) => updateFormData('hasAllergies', has)}
          onAllergyInfoChange={(info) => updateFormData('allergyInfo', info)}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 'house-rules' && (
        <HouseRulesStep
          acceptedHouseRules={formData.acceptedHouseRules}
          onAcceptChange={(accepted) => updateFormData('acceptedHouseRules', accepted)}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 'card-guarantee' && formData.date && (
        <CardGuaranteeStep
          acceptedCancellationPolicy={formData.acceptedCancellationPolicy}
          onAcceptChange={(accepted) => updateFormData('acceptedCancellationPolicy', accepted)}
          onSubmit={handleSubmit}
          onBack={handleBack}
          onGoToDetails={() => goToStep('details')}
          isSubmitting={isSubmitting}
          firstName={formData.firstName}
          lastName={formData.lastName}
          email={formData.email}
          partySize={formData.partySize}
          date={formData.date}
          slotStart={formData.slotStart}
          slotEnd={formData.slotEnd}
        />
      )}

      {step === 'confirmation' && confirmedBooking && (
        <ConfirmationStep
          booking={confirmedBooking}
          onNewBooking={handleNewBooking}
        />
      )}
    </div>
  );
}
