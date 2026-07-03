import { useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { avatarProxyUrl } from '../../utils/avatar';

export function UserProfile() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [avatarFailed, setAvatarFailed] = useState(false);

  if (!user) return null;

  const avatarSrc = avatarProxyUrl(user.picture);

  return (
    <div id="user-profile">
      {avatarSrc && !avatarFailed ? (
        <img
          src={avatarSrc}
          alt="User Avatar"
          onError={() => setAvatarFailed(true)}
          className="user-avatar"
        />
      ) : (
        <div className="user-avatar flex items-center justify-center bg-primary">
          <User className="w-4 h-4 text-white" />
        </div>
      )}
      <span className="user-name">{user.name || user.email}</span>
      <button onClick={logout} className="btn btn-logout">
        {t('header.logout')}
      </button>
    </div>
  );
}
