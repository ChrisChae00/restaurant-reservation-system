import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['en', 'ko', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async () => {
  // Try to get locale from cookie first
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE');
  
  let locale: Locale = defaultLocale;
  
  if (localeCookie && locales.includes(localeCookie.value as Locale)) {
    locale = localeCookie.value as Locale;
  } else {
    // Fall back to Accept-Language header
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');
    
    if (acceptLanguage) {
      const preferredLocale = acceptLanguage
        .split(',')
        .map(lang => lang.split(';')[0].trim().substring(0, 2))
        .find(lang => locales.includes(lang as Locale));
      
      if (preferredLocale) {
        locale = preferredLocale as Locale;
      }
    }
  }

  // Use switch statement for static imports
  let messages;
  switch (locale) {
    case 'ko':
      messages = (await import('@/messages/ko.json')).default;
      break;
    case 'fr':
      messages = (await import('@/messages/fr.json')).default;
      break;
    default:
      messages = (await import('@/messages/en.json')).default;
  }

  return {
    locale,
    messages
  };
});
