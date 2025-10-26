import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

export function LogoutButton() {
  const { logout } = useAuth();
  const { t } = useLanguage();

  return (
    <button onClick={logout} className="btn btn-logout">
      {t('header.logout')}
    </button>
  );
}
