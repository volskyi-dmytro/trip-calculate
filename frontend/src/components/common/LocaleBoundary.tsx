import { Navigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isSupportedLocale } from '../../utils/locale';

/** Route guard for the `:locale` URL segment — anything other than "en" or
 *  "uk" redirects to the default locale instead of rendering the page. */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const { locale } = useParams<{ locale: string }>();

  if (!isSupportedLocale(locale)) {
    return <Navigate to="/uk" replace />;
  }

  return <>{children}</>;
}
