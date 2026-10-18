// Provider-agnostic product analytics.
//
// Components call track('event_name', { props }) and never know which tool
// (if any) is behind it. Nothing is sent unless an analytics script is
// configured at build time (see initAnalytics below) — the default build
// ships with no tracker, matching the Privacy Policy as it stands today.
//
// Supported providers, detected at call time:
//   - Plausible: window.plausible(name, { props })
//   - Umami:     window.umami.track(name, props)
//   - PostHog:   window.posthog.capture(name, props)
// Any other tool can listen for the `tc:track` DOM event instead.

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>

/** Event names from the UX audit measurement plan (§10). */
export type AnalyticsEvent =
  | 'cta_click'
  | 'quick_estimate_edit'
  | 'quick_estimate_share_receipt'
  | 'quick_estimate_distance_lookup'
  | 'signin_dialog_open'
  | 'signin_continue'
  | 'signin_dismiss'
  | 'signin_success'
  | 'planner_view'
  | 'ai_prompt_sent'
  | 'ai_result_shown'
  | 'ai_error'
  | 'route_save_open'
  | 'route_save_success'
  | 'route_save_error'
  | 'waze_open'
  | 'receipt_share'
  | 'dashboard_view'

interface AnalyticsWindow {
  plausible?: (name: string, options?: { props?: AnalyticsProps }) => void
  umami?: { track: (name: string, props?: AnalyticsProps) => void }
  posthog?: { capture: (name: string, props?: AnalyticsProps) => void }
}

function clean(props: AnalyticsProps = {}): AnalyticsProps {
  // Drop undefined values; providers differ in how they serialize them.
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined))
}

/** Records a product event. Never throws: analytics must not break the UI. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === 'undefined') return
  const data = clean(props)
  try {
    const w = window as unknown as AnalyticsWindow
    if (typeof w.plausible === 'function') w.plausible(event, { props: data })
    else if (w.umami && typeof w.umami.track === 'function') w.umami.track(event, data)
    else if (w.posthog && typeof w.posthog.capture === 'function') w.posthog.capture(event, data)
    window.dispatchEvent(new CustomEvent('tc:track', { detail: { event, props: data } }))
  } catch {
    // ignore
  }
  if (import.meta.env.DEV) console.debug('[track]', event, data)
}

/**
 * Loads the analytics script when the build configures one:
 *   VITE_ANALYTICS_SRC      script URL, e.g. https://umami.example.com/script.js
 *   VITE_ANALYTICS_SITE_ID  site / website id (sent as data-website-id and data-domain)
 * The script host must also be allowed in the CSP (SecurityConfig: script-src
 * and connect-src). Cookieless tools (Plausible, Umami) need no consent banner.
 */
export function initAnalytics(): void {
  const src = import.meta.env.VITE_ANALYTICS_SRC as string | undefined
  if (!src || typeof document === 'undefined') return
  if (document.querySelector('script[data-tc-analytics]')) return
  const script = document.createElement('script')
  script.src = src
  script.defer = true
  script.dataset.tcAnalytics = 'true'
  const siteId = import.meta.env.VITE_ANALYTICS_SITE_ID as string | undefined
  if (siteId) {
    script.dataset.websiteId = siteId // Umami
    script.dataset.domain = siteId // Plausible
  }
  document.head.appendChild(script)
}
