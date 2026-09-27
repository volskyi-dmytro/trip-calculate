import { LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { API_BASE_URL } from '../../services/api';

// Below ~480px "Sign in with Google" no longer fits next to the language
// switch (see UX audit finding #2), so the label collapses to icon-only via
// CSS and the anchor's aria-label keeps it accessible.
export function LoginButton() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const loginPath = '/oauth2/authorization/google';
  const loginUrl =
    API_BASE_URL && API_BASE_URL.length > 0 ? `${API_BASE_URL}${loginPath}` : loginPath;

  return (
    <a
      href={loginUrl.trim()}
      className="btn btn-google"
      aria-label={t('header.login')}
      onClick={(e) => {
        e.preventDefault();
        login();
      }}
    >
      <LogIn size={16} aria-hidden="true" className="btn-google-icon" />
      <span className="btn-google-label">{t('header.login')}</span>
    </a>
  );
}
