import { useEffect, useState } from 'react'
import { Banner } from './ui/banner'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'

/** Relative wording in the UI language: whole minutes, seconds in the last minute. */
function relative(ms: number, language: string) {
  const rtf = new Intl.RelativeTimeFormat(language === 'uk' ? 'uk' : 'en', { numeric: 'always' })
  const secs = Math.max(1, Math.ceil(ms / 1000))
  return secs < 60 ? rtf.format(secs, 'second') : rtf.format(Math.ceil(secs / 60), 'minute')
}

/**
 * Inline replacement for the blocking rate-limit modal. `retryAt` may be null
 * (backend sent neither resetTime nor Retry-After): generic copy, no countdown.
 * Calls onExpire once the time has passed so the parent re-enables sending.
 */
export function LimitBanner({ retryAt, onExpire }: { retryAt: Date | null; onExpire: () => void }) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!retryAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [retryAt])

  const remaining = retryAt ? retryAt.getTime() - now : null
  useEffect(() => {
    if (remaining !== null && remaining <= 0) onExpire()
  }, [remaining, onExpire])

  if (!retryAt || remaining === null) {
    return <Banner variant="info">{t.chat.rateLimitedLater}</Banner>
  }
  const [before, after] = t.chat.rateLimitedBanner.split('{when}')
  return (
    <Banner variant="info">
      {before}
      {/* aria-live off: ticking every second must not be re-announced */}
      <time dateTime={retryAt.toISOString()} aria-live="off" className="font-semibold">
        {relative(Math.max(remaining, 0), language)}
      </time>
      {after}
    </Banner>
  )
}
