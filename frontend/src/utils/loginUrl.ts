import { API_BASE_URL } from '../services/api'

const LOGIN_PATH = '/oauth2/authorization/google'

/** Current page (path + query), used as the default place to come back to after sign-in. */
export function currentReturnTo(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname + window.location.search
}

/**
 * Google sign-in URL that brings the user back to `returnTo` (same page,
 * same language) instead of the homepage. The backend only honors
 * same-origin /en/... or /uk/... paths (LoginReturnTo.java).
 */
export function buildLoginUrl(returnTo: string = currentReturnTo()): string {
  const base = API_BASE_URL && API_BASE_URL.length > 0 ? `${API_BASE_URL}${LOGIN_PATH}` : LOGIN_PATH
  const safe = /^\/(en|uk)([/?#]|$)/.test(returnTo) ? returnTo : ''
  return (safe ? `${base}?returnTo=${encodeURIComponent(safe)}` : base).trim()
}
