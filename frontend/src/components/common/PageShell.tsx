import type { ReactNode } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Header } from './Header';
import { Footer } from './Footer';

/** First tab stop on every page; visually hidden until focused (.skip-link in global.css). */
export function SkipLink() {
  const { t } = useLanguage();
  return (
    <a href="#main" className="skip-link">
      {t('common.skipToContent')}
    </a>
  );
}

interface PageShellProps {
  children: ReactNode;
  /** Replaces the default <Header /> (e.g. HomePage passes its calculator callback). */
  header?: ReactNode;
  footer?: boolean;
  /** Class for <main>; pages with their own container pass '' . */
  mainClassName?: string;
}

/** Skip link + header + the page's single <main id="main"> + footer. */
export function PageShell({ children, header, footer = true, mainClassName = '' }: PageShellProps) {
  return (
    <>
      <SkipLink />
      {header ?? <Header />}
      <main id="main" tabIndex={-1} className={mainClassName || undefined}>
        {children}
      </main>
      {footer && <Footer />}
    </>
  );
}