'use client';

// Step 4: Allergy Information
import { useTranslations } from 'next-intl';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AllergyStepProps {
  hasAllergies: boolean;
  allergyInfo: string;
  onHasAllergiesChange: (has: boolean) => void;
  onAllergyInfoChange: (info: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AllergyStep({
  hasAllergies,
  allergyInfo,
  onHasAllergiesChange,
  onAllergyInfoChange,
  onNext,
  onBack,
}: AllergyStepProps) {
  const t = useTranslations('allergy');

  const canProceed = !hasAllergies || (hasAllergies && allergyInfo.trim().length > 0);

  return (
    <Card className="glass-card border-gold/20">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
          <ShieldAlert className="h-8 w-8 text-gold" />
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

        {/* Yes/No Toggle */}
        <div className="space-y-2">
          <Label className="text-base">{t('question')}</Label>
          <div className="flex gap-3">
            <Button
              type="button"
              variant={hasAllergies ? 'default' : 'outline'}
              onClick={() => onHasAllergiesChange(true)}
              className={`flex-1 ${
                hasAllergies
                  ? 'bg-gold text-background hover:bg-gold-light'
                  : 'border-gold/30 hover:bg-gold/10'
              }`}
            >
              {t('yes')}
            </Button>
            <Button
              type="button"
              variant={!hasAllergies ? 'default' : 'outline'}
              onClick={() => onHasAllergiesChange(false)}
              className={`flex-1 ${
                !hasAllergies
                  ? 'bg-gold text-background hover:bg-gold-light'
                  : 'border-gold/30 hover:bg-gold/10'
              }`}
            >
              {t('no')}
            </Button>
          </div>
        </div>

        {/* Allergy Details Input */}
        {hasAllergies && (
          <div className="space-y-2">
            <Label htmlFor="allergyInfo">{t('details.label')}</Label>
            <Textarea
              id="allergyInfo"
              value={allergyInfo}
              onChange={(e) => onAllergyInfoChange(e.target.value)}
              placeholder={t('details.placeholder')}
              className="bg-input border-gold/20 focus:border-gold min-h-[100px]"
            />
          </div>
        )}

        {/* Allergen Warnings */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <h3 className="font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('warnings.title')}
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong className="text-amber-400">🥜 </strong>{t('warnings.peanuts')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong className="text-amber-400">🐟 </strong>{t('warnings.fishGluten')}</span>
            </li>
          </ul>
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
            disabled={!canProceed}
            className="flex-1 bg-gold text-background hover:bg-gold-light"
          >
            {t('continue')} →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
