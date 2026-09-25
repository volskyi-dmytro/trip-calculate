import { useEffect } from 'react';

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
