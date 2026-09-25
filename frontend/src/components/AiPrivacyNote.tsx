import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../i18n/routePlanner';
import { withLocalePrefix } from '../utils/locale';

// Shown under every AI chat input: users learn where their messages go at the
// moment they type, not only in the Privacy Policy.
export function AiPrivacyNote({ className = '' }: { className?: string }) {
  const { language } = useLanguage();
  const t = getTranslation(language).chat;
  return (
    <p className={`text-xs leading-snug ${className}`} style={{ color: 'var(--nav-text-secondary, var(--text-2))' }}>
      {t.privacyNote}{' '}
      <Link to={`${withLocalePrefix('/privacy', language)}#what-we-collect`} className="underline">
        {t.privacyLink}
      </Link>
    </p>
  );
}
