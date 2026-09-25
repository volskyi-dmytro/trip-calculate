import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../i18n/routePlanner';
import { withLocalePrefix } from '../utils/locale';

// Shown under every AI input: users learn where their text goes at the moment
// they type, not only in the Privacy Policy.
export function AiPrivacyNote({ className = '', kind = 'chat' }: { className?: string; kind?: 'chat' | 'car' }) {
  const { language } = useLanguage();
  const t = getTranslation(language).chat;
  return (
    <p className={`text-xs leading-snug ${className}`} style={{ color: 'var(--nav-text-secondary, var(--text-2))' }}>
      {kind === 'car' ? t.carPrivacyNote : t.privacyNote}{' '}
      <Link to={`${withLocalePrefix('/privacy', language)}#what-we-collect`} className="underline">
        {t.privacyLink}
      </Link>
    </p>
  );
}
