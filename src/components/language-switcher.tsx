'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const languages = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'ko', name: '한국어', short: 'KO' },
  { code: 'fr', name: 'Français', short: 'FR' },
] as const;

interface LanguageSwitcherProps {
  currentLocale: string;
}

export function LanguageSwitcher({ currentLocale }: LanguageSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLanguageChange = (locale: string) => {
    // Set cookie for language preference
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`; // 1 year
    
    startTransition(() => {
      router.refresh();
    });
  };

  const currentLang = languages.find(l => l.code === currentLocale) || languages[0];

  return (
    <Select
      value={currentLocale}
      onValueChange={handleLanguageChange}
      disabled={isPending}
    >
      <SelectTrigger className="w-auto gap-2 border-gold/30 bg-transparent hover:bg-gold/10">
        <Globe className="h-4 w-4 text-gold" />
        <SelectValue>
          <span className="hidden sm:inline">{currentLang.name}</span>
          <span className="sm:hidden">{currentLang.short}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-card border-gold/20">
        {languages.map((lang) => (
          <SelectItem
            key={lang.code}
            value={lang.code}
            className="cursor-pointer hover:bg-gold/10"
          >
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Compact version for mobile
export function LanguageSwitcherCompact({ currentLocale }: LanguageSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const cycleLanguage = () => {
    const currentIndex = languages.findIndex(l => l.code === currentLocale);
    const nextIndex = (currentIndex + 1) % languages.length;
    const nextLocale = languages[nextIndex].code;
    
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`;
    
    startTransition(() => {
      router.refresh();
    });
  };

  const currentLang = languages.find(l => l.code === currentLocale) || languages[0];

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleLanguage}
      disabled={isPending}
      className="border border-gold/30 hover:bg-gold/10 font-medium text-xs w-9 h-9 p-0"
      title={`Current: ${currentLang.name}. Click to change.`}
    >
      {currentLang.short}
    </Button>
  );
}
