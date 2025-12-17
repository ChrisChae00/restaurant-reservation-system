import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BookingForm } from '@/components/booking';
import { LanguageSwitcher } from '@/components/language-switcher';

export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations('home');

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header with Language Switcher */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-gold/10">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <h1 className="text-xl font-serif text-gold-light tracking-wide">
              Restaurant Coréen Luna
            </h1>
          </Link>
          <LanguageSwitcher currentLocale={locale} />
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-26 pb-12 px-6 flex-none">
        {/* Subtle Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gold/5 rounded-full blur-3xl -z-10" />

        <div className="container mx-auto text-center max-w-2xl space-y-6">
          <div>
            <span className="inline-block px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-gold/80 border border-gold/20 rounded-full">
              {t('hero.badge')}
            </span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-serif text-foreground font-medium tracking-tight">
            {t('hero.title')}
          </h2>
          
          {t('hero.subtitle') && (
            <p className="text-lg text-muted-foreground font-light leading-relaxed">
              {t('hero.subtitle')}
            </p>
          )}
        </div>
      </section>

      {/* Booking Form Section */}
      <section className="px-4 pb-20 flex-grow">
        <div className="container mx-auto">
          <BookingForm />
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="py-8 px-6 border-t border-border/40">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-muted-foreground gap-4">
          <p>© {new Date().getFullYear()} Resto Luna. {t('footer.rights')}</p>
          <p>
            {t('hero.contact')} {' '}
            <a href="tel:5145550123" className="text-gold hover:underline transition-colors">
              (514) 555-0123
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
