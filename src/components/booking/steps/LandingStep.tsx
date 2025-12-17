'use client';

// Step 1: Landing - Rules explanation and party size filter
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, ExternalLink, Phone, Mail, AlertCircle, CheckCircle, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  SMALL_GROUP_THRESHOLD,
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  LARGE_GROUP_THRESHOLD,
  LIBRO_BOOKING_URL,
  RESTAURANT_CONTACT,
  getPartySizeCategory,
} from '@/lib/booking-rules';

interface LandingStepProps {
  partySize: number;
  agreedToRules: boolean;
  onPartySizeChange: (size: number) => void;
  onAgreementChange: (agreed: boolean) => void;
  onNext: () => void;
}

export function LandingStep({
  partySize,
  agreedToRules,
  onPartySizeChange,
  onAgreementChange,
  onNext,
}: LandingStepProps) {
  const t = useTranslations('landing');
  const [inputValue, setInputValue] = useState(partySize > 0 ? partySize.toString() : '');

  const handlePartySizeChange = (value: string) => {
    setInputValue(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      onPartySizeChange(num);
    } else {
      onPartySizeChange(0);
    }
  };

  const incrementPartySize = () => {
    const current = parseInt(inputValue || '0', 10);
    const newValue = isNaN(current) ? 1 : Math.min(current + 1, 50);
    handlePartySizeChange(newValue.toString());
  };

  const decrementPartySize = () => {
    const current = parseInt(inputValue || '0', 10);
    const newValue = isNaN(current) ? 0 : Math.max(current - 1, 0);
    handlePartySizeChange(newValue.toString());
  };

  const category = partySize > 0 ? getPartySizeCategory(partySize) : null;

  return (
    <Card className="glass-card border-none shadow-none bg-transparent">
      <CardContent className="space-y-8 p-0">
        
        {/* Header Removed as per request */}

        {/* Input Section - Centered & Clean */}
        <div className="flex flex-col items-center space-y-6 pt-4">
          <Label htmlFor="partySize" className="text-xs font-medium text-gold/60 uppercase tracking-[0.2em]">
            {t('partySize.label')}
          </Label>
          
          <div className="flex items-center gap-6">
            <Button
              variant="outline"
              size="icon"
              onClick={decrementPartySize}
              disabled={!inputValue || parseInt(inputValue) <= 0}
              className="h-12 w-12 rounded-full border-gold/30 hover:bg-gold/10 hover:text-gold"
            >
              <Minus className="h-6 w-6" />
            </Button>

            <div className="relative w-24 group">
              <Input
                id="partySize"
                type="number"
                min={0}
                max={50}
                value={inputValue}
                onChange={(e) => handlePartySizeChange(e.target.value)}
                placeholder="0"
                className="text-center text-4xl font-light h-16 bg-transparent border-b-2 border-gold/20 rounded-none focus-visible:ring-0 focus-visible:border-gold px-0 transition-all duration-300 placeholder:text-muted-foreground/20 no-spinner"
              />
              {/* Animated underline effect */}
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gold scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 origin-center" />
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={incrementPartySize}
              disabled={parseInt(inputValue || '0') >= 50}
              className="h-12 w-12 rounded-full border-gold/30 hover:bg-gold/10 hover:text-gold"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Information Rules (Only show if party size is valid or empty) */}
        {!category && (
          <div className="grid gap-3 pt-4">
            <div className="text-xs text-muted-foreground grid gap-2 justify-center">
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-gold/50" />
                {t('rules.groupSize')}
              </div>
               <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-gold/50" />
                {t('rules.fixedSlots')}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-gold/50" />
                {t('rules.menuRequired')}
              </div>
            </div>
          </div>
        )}

        {/* Conditional UI based on party size */}
        {category === 'small' && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-4 rounded border border-border/50 bg-secondary/10">
              <p className="text-sm text-foreground font-medium mb-1">{t('partySize.smallGroup.title')}</p>
              <p className="text-xs text-muted-foreground mb-4">{t('partySize.smallGroup.description')}</p>
              <Button
                asChild
                variant="outline"
                className="w-full border-gold/30 hover:bg-gold/5 hover:text-gold"
              >
                <a href={LIBRO_BOOKING_URL} target="_blank" rel="noopener noreferrer">
                  {t('partySize.smallGroup.button')}
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
            </div>
          </div>
        )}

        {category === 'large' && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-4 rounded border border-border/50 bg-secondary/10">
               <p className="text-sm text-foreground font-medium mb-1">{t('partySize.largeGroup.title')}</p>
              <p className="text-xs text-muted-foreground mb-4">{t('partySize.largeGroup.description')}</p>
              <div className="flex flex-col gap-2 text-sm items-center">
                <a href={`tel:${RESTAURANT_CONTACT.phone}`} className="flex items-center gap-2 hover:text-gold transition-colors">
                  <Phone className="h-3 w-3" />
                  {RESTAURANT_CONTACT.phone}
                </a>
                <a href={`mailto:${RESTAURANT_CONTACT.email}`} className="flex items-center gap-2 hover:text-gold transition-colors">
                  <Mail className="h-3 w-3" />
                  {RESTAURANT_CONTACT.email}
                </a>
              </div>
            </div>
          </div>
        )}

        {category === 'group' && (
          <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {/* Simplified Rules List */}
            <div className="space-y-2 text-sm text-foreground/80 px-2 py-4 border-y border-border/30">
               <div className="flex items-start gap-3">
                 <CheckCircle className="h-4 w-4 text-gold/70 mt-0.5 shrink-0" />
                 <span>{t('rules.groupSize')}</span>
               </div>
               <div className="flex items-start gap-3">
                 <CheckCircle className="h-4 w-4 text-gold/70 mt-0.5 shrink-0" />
                 <span>{t('rules.fixedSlots')}</span>
               </div>
               <div className="flex items-start gap-3">
                 <CheckCircle className="h-4 w-4 text-gold/70 mt-0.5 shrink-0" />
                 <span>{t('rules.menuRequired')}</span>
               </div>
            </div>

            {/* Agreement Checkbox */}
            <div className="flex items-center justify-center space-x-3">
              <Checkbox
                id="agreement"
                checked={agreedToRules}
                onCheckedChange={(checked) => onAgreementChange(checked === true)}
                className="border-gold/50 data-[state=checked]:bg-gold data-[state=checked]:border-gold"
              />
              <Label
                htmlFor="agreement"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                {t('agreement')}
              </Label>
            </div>

            {/* Continue Button */}
            <Button
              className="w-full bg-gold text-background hover:bg-gold-light h-12 text-base tracking-wide"
              onClick={onNext}
              disabled={!agreedToRules}
            >
              {t('continue')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
