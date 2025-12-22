'use client';

// Step 6: Card Guarantee with Stripe SetupIntent
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, Shield, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { format } from 'date-fns';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CardGuaranteeStepProps {
  acceptedCancellationPolicy: boolean;
  onAcceptChange: (accepted: boolean) => void;
  onSubmit: (stripeCustomerId: string, stripePaymentMethodId: string) => void;
  onBack: () => void;
  isSubmitting: boolean;
  // Booking data for display
  firstName: string;
  lastName: string;
  email: string;
  partySize: number;
  date: Date;
  slotStart: string;
  slotEnd: string;
}

// Stripe Card Element styling
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#71717a',
      },
      iconColor: '#d4a853',
    },
    invalid: {
      color: '#ef4444',
      iconColor: '#ef4444',
    },
  },
};

function CardGuaranteeInner({
  acceptedCancellationPolicy,
  onAcceptChange,
  onSubmit,
  onBack,
  isSubmitting,
  firstName,
  lastName,
  email,
  partySize,
  date,
  slotStart,
  slotEnd,
}: CardGuaranteeStepProps) {
  const t = useTranslations('cardGuarantee');
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const handleSubmit = async () => {
    if (!stripe || !elements) {
      setCardError('Payment system not loaded. Please refresh and try again.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setCardError('Card input not found. Please refresh and try again.');
      return;
    }

    setCardError(null);
    setProcessing(true);

    try {
      // 1. Create SetupIntent on server
      const setupResponse = await fetch('/api/stripe/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: `${firstName} ${lastName}`,
          bookingDate: format(date, 'yyyy-MM-dd'),
          partySize,
        }),
      });

      if (!setupResponse.ok) {
        throw new Error('Failed to initialize payment');
      }

      const { clientSecret, customerId } = await setupResponse.json();

      // 2. Confirm SetupIntent with card details
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${firstName} ${lastName}`,
              email,
            },
          },
        }
      );

      if (stripeError) {
        setCardError(stripeError.message || 'Card verification failed');
        return;
      }

      if (setupIntent?.status === 'succeeded') {
        // Pass customer ID and payment method ID to parent
        onSubmit(customerId, setupIntent.payment_method as string);
      } else {
        setCardError('Card verification incomplete. Please try again.');
      }
    } catch (err) {
      console.error('Payment setup error:', err);
      setCardError('Failed to process card. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const canSubmit = acceptedCancellationPolicy && cardComplete && !processing && !isSubmitting;

  return (
    <Card className="glass-card border-gold/20">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
          <CreditCard className="h-8 w-8 text-gold" />
        </div>
        <CardTitle className="text-2xl text-gold-light">{t('title')}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground text-center">
          {t('description')}
        </p>

        {/* Booking Summary */}
        <div className="rounded-lg bg-secondary/50 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name:</span>
            <span>{firstName} {lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date:</span>
            <span>{format(date, 'EEEE, MMMM d, yyyy')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time:</span>
            <span>{formatTime(slotStart)} - {formatTime(slotEnd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Guests:</span>
            <span>{partySize} people</span>
          </div>
        </div>

        {/* Important Notices */}
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
            <span className="text-sm text-green-200">{t('notice.noCharge')}</span>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
            <span className="text-sm text-green-200">{t('notice.secure')}</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-sm text-amber-200">{t('notice.penalty')}</span>
          </div>
        </div>

        {/* Credit Card Input */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gold" />
            {t('card.label')}
          </Label>
          <div className="p-4 rounded-lg bg-input border border-gold/20">
            <CardElement
              options={cardElementOptions}
              onChange={(e) => {
                setCardComplete(e.complete);
                if (e.error) {
                  setCardError(e.error.message);
                } else {
                  setCardError(null);
                }
              }}
            />
          </div>
          {cardError && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {cardError}
            </p>
          )}
        </div>

        {/* Agreement Checkbox */}
        <div className="flex items-start space-x-3 pt-4 border-t border-gold/10">
          <Checkbox
            id="cancellationPolicy"
            checked={acceptedCancellationPolicy}
            onCheckedChange={(checked) => onAcceptChange(checked === true)}
            className="mt-1 border-gold/50 data-[state=checked]:bg-gold data-[state=checked]:border-gold"
          />
          <Label
            htmlFor="cancellationPolicy"
            className="text-sm text-muted-foreground cursor-pointer leading-relaxed"
          >
            {t('agreement')}
          </Label>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={processing || isSubmitting}
            className="flex-1 border-gold/30"
          >
            ← {t('back')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-gold text-background hover:bg-gold-light"
          >
            {processing || isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Wrapper with Stripe Elements Provider
export function CardGuaranteeStep(props: CardGuaranteeStepProps) {
  return (
    <Elements stripe={stripePromise}>
      <CardGuaranteeInner {...props} />
    </Elements>
  );
}
