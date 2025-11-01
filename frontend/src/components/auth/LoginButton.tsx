import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { API_BASE_URL } from '../../services/api';

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
      onClick={(e) => {
        e.preventDefault();
        login();
      }}
    >
      {t('header.login')}
    </a>
  );
}
