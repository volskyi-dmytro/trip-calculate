import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

export function LoginButton() {
  const { login } = useAuth();
  const { t } = useLanguage();

  return (
    <a href="/oauth2/authorization/google" className="btn btn-google" onClick={(e) => {
      e.preventDefault();
      login();
    }}>
      {t('header.login')}
    </a>
  );
}
