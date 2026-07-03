/**
 * Google avatar URLs (lh3.googleusercontent.com) are blocked by our CSP
 * (img-src 'self') and are rate-limited when hotlinked. Always load them
 * through the backend proxy, which serves them same-origin.
 */
export function avatarProxyUrl(pictureUrl: string | null | undefined): string | null {
  if (!pictureUrl) return null;
  return `/api/avatar/proxy?url=${encodeURIComponent(pictureUrl)}`;
}
