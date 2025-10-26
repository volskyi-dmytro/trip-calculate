import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

export function UserProfile() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  if (!user) return null;

  const avatarSrc = user.picture
    ? `/api/avatar/proxy?url=${encodeURIComponent(user.picture)}`
    : '/images/default-avatar.png';

  return (
    <div id="user-profile">
      <img src={avatarSrc} alt="User Avatar" className="user-avatar" />
      <span className="user-name">{user.name || user.email}</span>
      <button onClick={logout} className="btn btn-logout">
        {t('header.logout')}
      </button>
    </div>
  );
}
