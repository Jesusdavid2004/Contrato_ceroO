import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';

const savedLanguage = localStorage.getItem('cc_locale') || navigator.language.split('-')[0] || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: esTranslations },
      es: { translation: enTranslations }
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
