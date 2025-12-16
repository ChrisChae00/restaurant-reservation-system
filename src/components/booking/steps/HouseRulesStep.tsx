'use client';

// Step 5: House Rules Agreement
import { useTranslations } from 'next-intl';
import { ScrollText, Clock, Receipt, Ban, Wine, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface HouseRulesStepProps {
  acceptedHouseRules: boolean;
  onAcceptChange: (accepted: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

export function HouseRulesStep({
  acceptedHouseRules,
  onAcceptChange,
  onNext,
  onBack,
}: HouseRulesStepProps) {
  const t = useTranslations('houseRules');

  const rules = [
    {
      icon: Clock,
      title: t('rules.headcount.title'),
      description: t('rules.headcount.description'),
    },
    {
      icon: Receipt,
      title: t('rules.oneBill.title'),
      description: t('rules.oneBill.description'),
    },
    {
      icon: Ban,
      title: t('rules.noOutside.title'),
      description: t('rules.noOutside.description'),
    },
    {
      icon: Wine,
      title: t('rules.alcohol.title'),
      description: t('rules.alcohol.description'),
    },
  ];

  return (
    <Card className="glass-card border-gold/20">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20">
          <ScrollText className="h-8 w-8 text-gold" />
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

        {/* House Rules List */}
        <div className="space-y-4">
          {rules.map((rule, index) => (
            <div
              key={index}
              className="flex items-start gap-4 p-4 rounded-lg bg-secondary/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 shrink-0">
                <rule.icon className="h-5 w-5 text-gold" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">{rule.title}</h4>
                <p className="text-sm text-muted-foreground">{rule.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Agreement Checkbox */}
        <div className="flex items-start space-x-3 pt-4 border-t border-gold/10">
          <Checkbox
            id="houseRules"
            checked={acceptedHouseRules}
            onCheckedChange={(checked) => onAcceptChange(checked === true)}
            className="mt-1 border-gold/50 data-[state=checked]:bg-gold data-[state=checked]:border-gold"
          />
          <Label
            htmlFor="houseRules"
            className="text-sm text-muted-foreground cursor-pointer leading-relaxed"
          >
            {t('agreement')}
          </Label>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 border-gold/30"
          >
            ← {t('back')}
          </Button>
          <Button
            onClick={onNext}
            disabled={!acceptedHouseRules}
            className="flex-1 bg-gold text-background hover:bg-gold-light"
          >
            {t('continue')} →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
