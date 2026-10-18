import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getTranslation, type Language } from '../../i18n/routePlanner'

interface GuestAiPromptProps {
  onSignIn: () => void
  /** Static sample trip, so guests can see what the AI produces before signing in. */
  sampleHref: string
}

/** Takes the AI composer's place for guests: manual planning stays fully open,
 *  only the (paid) AI request needs an account. */
export function GuestAiPrompt({ onSignIn, sampleHref }: GuestAiPromptProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language).guest
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
        <Sparkles className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--nav-accent)' }} />
        {t.aiTitle}
      </p>
      <p className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.aiText}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSignIn}
          className="min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold"
          style={{ background: 'var(--nav-accent)', color: 'var(--on-accent)' }}
        >
          {t.aiCta}
        </button>
        <Link to={sampleHref} className="min-h-11 inline-flex items-center text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
          {t.sampleLink}
        </Link>
      </div>
    </div>
  )
}
