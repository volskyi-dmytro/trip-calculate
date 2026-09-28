import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'Trip Calculate';

export function formatDocumentTitle(pageTitle: string | null | undefined): string {
  return pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
}

/**
 * Keeps the browser tab title in step with client-side navigation. The server
 * sends the same titles for public pages (SpaShellController), so a crawler
 * and a user who navigated there see the same text.
 */
export function useDocumentTitle(pageTitle: string | null | undefined) {
  useEffect(() => {
    document.title = formatDocumentTitle(pageTitle);
  }, [pageTitle]);
}

// Page-specific tags SpaShellController writes for the URL the visitor landed on.
const SERVER_PAGE_TAGS =
  'link[rel="canonical"], link[rel="alternate"][hreflang], script[type="application/ld+json"], meta[name="description"]';

/**
 * After a client-side navigation those tags describe the previous page (e.g. a
 * Kyiv → Lviv canonical on the dashboard). Crawlers always load each URL fresh
 * and get the server's tags, so dropping stale ones beats re-deriving them here.
 */
export function useDropServerHeadOnNavigation() {
  const { pathname } = useLocation();
  const landing = useRef(pathname);
  useEffect(() => {
    if (pathname === landing.current) return;
    document.querySelectorAll(SERVER_PAGE_TAGS).forEach((el) => el.remove());
  }, [pathname]);
}
