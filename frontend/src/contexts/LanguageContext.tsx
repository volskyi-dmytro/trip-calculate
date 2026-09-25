import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Language } from '../types';
import { isSupportedLocale, withLocalePrefix } from '../utils/locale';
import { translate, translatePlural } from '../i18n/common';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  /** Plural-aware lookup of `key_one`/`key_few`/`key_many`/`key_other`, with `{count}` filled in. */
  tn: (key: string, count: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const urlLocale = location.pathname.split('/')[1];

  const [language, setLanguageState] = useState<Language>(() => {
    if (isSupportedLocale(urlLocale)) return urlLocale;
    const savedLang = localStorage.getItem('language');
    return (savedLang as Language) || 'uk';
  });

  // The URL is authoritative once it carries a locale: navigating to a
  // /en or /uk path (via a link, back/forward, or a shared URL) must
  // update the active language even if it doesn't match localStorage yet.
  useEffect(() => {
    if (isSupportedLocale(urlLocale) && urlLocale !== language) {
      setLanguageState(urlLocale);
    }
  }, [urlLocale, language]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    // Keep ?routeId=… and #anchors: switching language must not lose the loaded route.
    navigate(withLocalePrefix(location.pathname, lang) + location.search + location.hash);
  };

  const t = (key: string): string => translate(language, key);
  const tn = (key: string, count: number): string => translatePlural(language, key, count);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tn }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs next to its provider; only affects dev hot reload
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
