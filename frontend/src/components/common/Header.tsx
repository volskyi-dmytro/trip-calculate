import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeason } from '../../hooks/useSeason';
import { LoginButton } from '../auth/LoginButton';
import { UserProfile } from '../auth/UserProfile';

interface HeaderProps {
  onCalculateClick: () => void;
}

export function Header({ onCalculateClick }: HeaderProps) {
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const season = useSeason();

  const handleCreateTripClick = () => {
    if (user) {
      alert(language === 'uk' ? 'Функція в розробці!' : 'Feature coming soon!');
    }
  };

  const headerStyle = {
    backgroundImage: `url(/images/${season}.webp)`,
  };

  return (
    <header className="header" style={headerStyle}>
      <div className="container">
        <div className="language-switch">
          <button onClick={() => setLanguage('en')}>EN</button>
          <button onClick={() => setLanguage('uk')}>UA</button>
        </div>
        <div className="mode-switch">
          <input
            type="checkbox"
            id="darkmode-toggle"
            checked={theme === 'dark'}
            onChange={toggleTheme}
          />
          <label htmlFor="darkmode-toggle"></label>
        </div>

        <div className="auth-section">
          {loading ? (
            <div>Loading...</div>
          ) : user ? (
            <UserProfile />
          ) : (
            <div id="login-section">
              <LoginButton />
            </div>
          )}
        </div>

        <h1>{t('header.title')}</h1>
        <div className="buttons">
          <button
            id="create-trip-btn"
            className={`btn ${!user ? 'inactive' : ''}`}
            onClick={handleCreateTripClick}
            title={!user ? t('header.loginRequired') : ''}
            disabled={!user}
          >
            {t('header.createTrip')}
          </button>
          <button className="btn" onClick={onCalculateClick}>
            {t('header.calculate')}
          </button>
        </div>
      </div>
    </header>
  );
}
