import { LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { buildLoginUrl } from '../../utils/loginUrl';

// On narrow screens the full "Sign in with Google" label doesn't fit next to
// the language switch, so it swaps to a short visible "Sign in" (CSS) —
// an icon-only arrow wasn't recognizable as sign-in (UX audit A6).
export function LoginButton() {
  const { login } = useAuth();
  const { t } = useLanguage();

  return (
    <a
      href={buildLoginUrl()}
      className="btn btn-google"
      aria-label={t('header.login')}
      onClick={(e) => {
        e.preventDefault();
        login(undefined, 'header');
      }}
    >
      <LogIn size={16} aria-hidden="true" className="btn-google-icon" />
      <span className="btn-google-label">{t('header.login')}</span>
      <span className="btn-google-label-short" aria-hidden="true">{t('header.signInShort')}</span>
    </a>
  );
}
