'use client';

// Step 3: Menu Policy Agreement
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, ExternalLink, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MENU_PDF_URL } from '@/lib/booking-rules';

interface MenuPolicyStepProps {
  acceptedMenuPolicy: boolean;
  onAcceptChange: (accepted: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

export function MenuPolicyStep({
  acceptedMenuPolicy,
  onAcceptChange,
  onNext,
  onBack,
}: MenuPolicyStepProps) {
  const t = useTranslations('menuPolicy');

  return (
    <Card className="glass-card border-gold/20">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
          <UtensilsCrossed className="h-8 w-8 text-gold" />
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

        {/* Menu Rules */}
        <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
          <h3 className="font-semibold text-gold">{t('rules.title')}</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-gold mt-0.5 shrink-0" />
              {t('rules.mandatory')}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-gold mt-0.5 shrink-0" />
              {t('rules.noAlaCarte')}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-gold mt-0.5 shrink-0" />
              {t('rules.menuTypes')}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-gold mt-0.5 shrink-0" />
              {t('rules.minimumOrder')}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-gold mt-0.5 shrink-0" />
              {t('rules.children')}
            </li>
          </ul>
        </div>

        {/* View Menu Button */}
        <Button
          variant="outline"
          asChild
          className="w-full border-gold/30 hover:bg-gold/10"
        >
          <a href={MENU_PDF_URL} target="_blank" rel="noopener noreferrer">
            {t('viewMenu')}
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>

        {/* Agreement Checkbox */}
        <div className="flex items-start space-x-3 pt-4 border-t border-gold/10">
          <Checkbox
            id="menuPolicy"
            checked={acceptedMenuPolicy}
            onCheckedChange={(checked) => onAcceptChange(checked === true)}
            className="mt-1 border-gold/50 data-[state=checked]:bg-gold data-[state=checked]:border-gold"
          />
          <Label
            htmlFor="menuPolicy"
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
            className="flex-1 border-gold/30"
          >
            ← {t('back')}
          </Button>
          <Button
            onClick={onNext}
            disabled={!acceptedMenuPolicy}
            className="flex-1 bg-gold text-background hover:bg-gold-light"
          >
            {t('continue')} →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
