import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const season = useSeason();

  const handleCreateTripClick = () => {
    if (user) {
      navigate('/route-planner');
    }
  };

  const headerStyle = {
    backgroundImage: `url(/images/${season}.webp)`,
  };

  return (
    <header className="header" style={headerStyle}>
      <div className="container">
        <div
          className={`language-switch ${
            language === 'uk' ? 'lang-uk' : 'lang-en'
          }`}
        >
          <button
            type="button"
            className={language === 'en' ? 'active' : ''}
            aria-pressed={language === 'en'}
            onClick={() => setLanguage('en')}
          >
            EN
          </button>
          <button
            type="button"
            className={language === 'uk' ? 'active' : ''}
            aria-pressed={language === 'uk'}
            onClick={() => setLanguage('uk')}
          >
            UA
          </button>
          <span className="language-toggle-indicator" aria-hidden="true"></span>
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
