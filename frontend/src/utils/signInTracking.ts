// Lets the app tell "just came back from Google" apart from an ordinary
// page load, so `signin_success` is recorded once per sign-in.
const KEY = 'tc_signin_started'

export function markSignInStarted(source: string, returnTo: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ source, returnTo, at: Date.now() }))
  } catch { /* storage blocked */ }
}

export function consumeSignInStarted(): { source: string; returnTo: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as { source: string; returnTo: string; at: number }
    // Ignore a stale marker from an abandoned attempt.
    return Date.now() - parsed.at < 15 * 60 * 1000 ? parsed : null
  } catch {
    return null
  }
}
