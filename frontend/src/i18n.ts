import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';

const supportedLanguages = ['en', 'es'] as const;
const savedLanguage = localStorage.getItem('lang') || localStorage.getItem('cc_locale');
const browserLanguage = navigator.language.split('-')[0];
const normalizeLanguage = (language: string | null): 'en' | 'es' | null => {
  if (language?.startsWith('es')) return 'es';
  if (language?.startsWith('en')) return 'en';
  return null;
};
const initialLanguage = normalizeLanguage(savedLanguage) || normalizeLanguage(browserLanguage) || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      es: { translation: esTranslations }
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

i18n.on('languageChanged', (language) => {
  const supportedLanguage = supportedLanguages.includes(language as 'en' | 'es') ? language : 'en';
  localStorage.setItem('lang', supportedLanguage);
  document.documentElement.lang = supportedLanguage;
});
document.documentElement.lang = initialLanguage;
localStorage.setItem('lang', initialLanguage);

export default i18n;
