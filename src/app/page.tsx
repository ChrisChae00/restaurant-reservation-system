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
          <div className="flex items-center gap-6">
            <a href="https://www.restoluna.com/" target="_blank" rel="noopener noreferrer" className="text-sm font-light text-muted-foreground hover:text-gold transition-colors hidden sm:flex items-center gap-1.5">
              {t('mainWebsite')}
              <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
            <LanguageSwitcher currentLocale={locale} />
          </div>
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

      {/* Premium Footer */}
      <footer className="py-8 px-6 border-t border-gold/10 bg-background/30 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center md:text-left space-y-2">
              <h3 className="text-base font-serif text-gold-light tracking-wide">Restaurant Coréen Luna</h3>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] font-light">
                © {new Date().getFullYear()} • {t('footer.rights')} • <Link href="/privacy" className="hover:text-gold transition-colors">Privacy Policy</Link>
              </p>
            </div>
            
            <div className="flex flex-col gap-1.5 text-sm">
              <a href="https://www.restoluna.com/" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 hover:text-gold transition-colors">
                <span className="w-20 text-[10px] uppercase tracking-[0.15em] text-gold/80 font-medium">Website:</span>
                <span className="font-light tracking-wide group-hover:text-gold-light opacity-90">restoluna.com</span>
              </a>
              <a href={`tel:${t('footer.phone_fr').replace(/\D/g, '')}`} className="group flex items-center gap-3 hover:text-gold transition-colors">
                <span className="w-20 text-[10px] uppercase tracking-[0.15em] text-gold/80 font-medium">Français:</span>
                <span className="font-light tracking-wide group-hover:text-gold-light opacity-90">{t('footer.phone_fr')}</span>
              </a>
              <a href={`tel:${t('footer.phone_en').replace(/\D/g, '')}`} className="group flex items-center gap-3 hover:text-gold transition-colors">
                <span className="w-20 text-[10px] uppercase tracking-[0.15em] text-gold/80 font-medium">English:</span>
                <span className="font-light tracking-wide group-hover:text-gold-light opacity-90">{t('footer.phone_en')}</span>
              </a>
              <a href="mailto:lunagroupreservation@gmail.com" className="group flex items-center gap-3 hover:text-gold transition-colors">
                <span className="w-20 text-[10px] uppercase tracking-[0.15em] text-gold/80 font-medium">Email:</span>
                <span className="font-light tracking-wide group-hover:text-gold-light opacity-90">lunagroupreservation@gmail.com</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
