import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

const translations = {
  'en': en,
  'zh-CN': zhCN,
  'zh': zhCN,
};

function detectLanguage() {
  const stored = localStorage.getItem('app_language');
  if (stored && translations[stored]) return stored;
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  if (browserLang.startsWith('zh')) return 'zh-CN';
  return 'en';
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(detectLanguage);

  useEffect(() => {
    localStorage.setItem('app_language', locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key, params = {}) => {
      const keys = key.split('.');
      let value = translations[locale];
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }
      if (typeof value !== 'string') {
        // fallback to en
        value = translations['en'];
        for (const k of keys) {
          if (value && typeof value === 'object') {
            value = value[k];
          } else {
            value = undefined;
            break;
          }
        }
      }
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (_, k) =>
        params[k] !== undefined ? String(params[k]) : `{${k}}`
      );
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}
