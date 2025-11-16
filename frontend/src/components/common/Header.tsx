import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeason } from '../../hooks/useSeason';
import { LoginButton } from '../auth/LoginButton';
import { UserMenu } from '../auth/UserMenu';
import { Home } from 'lucide-react';

interface HeaderProps {
  onCalculateClick?: () => void;
}

export function Header({ onCalculateClick }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const season = useSeason();

  // Check if we're on the homepage
  const isHomePage = location.pathname === '/';

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
        <div className="language-switch">
          <input
            type="checkbox"
            id="language-toggle"
            checked={language === 'uk'}
            onChange={() => setLanguage(language === 'en' ? 'uk' : 'en')}
          />
          <label htmlFor="language-toggle">
            <span className="slider"></span>
          </label>
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
            <div className="text-gray-600 dark:text-gray-400">Loading...</div>
          ) : user ? (
            <UserMenu />
          ) : (
            <div id="login-section">
              <LoginButton />
            </div>
          )}
        </div>

        <h1
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer' }}
          title={t('header.nav.home')}
        >
          {t('header.title')}
        </h1>

        {/* Return to Homepage Button - Only show when not on homepage */}
        {!isHomePage && (
          <div style={{ gridArea: 'nav' }} className="w-full flex justify-center">
            <button
              onClick={() => navigate('/')}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                maxWidth: '300px',
              }}
            >
              <Home size={20} />
              <span>{t('header.returnHome')}</span>
            </button>
          </div>
        )}

        {/* Primary Action Buttons - Only show on homepage */}
        {isHomePage && (
          <div className="buttons flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center w-full px-4 sm:px-0">
            <button
              id="create-trip-btn"
              className={`btn w-full sm:w-auto ${!user ? 'inactive' : ''}`}
              onClick={handleCreateTripClick}
              title={!user ? t('header.loginRequired') : ''}
              disabled={!user}
              style={{
                fontSize: '1.1em',
                padding: '12px 30px',
                fontWeight: '600',
                background: user ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
              }}
            >
              {t('header.createTrip')}
            </button>
            <button
              className="btn w-full sm:w-auto"
              onClick={onCalculateClick}
              style={{
                fontSize: '1.1em',
                padding: '12px 30px',
                fontWeight: '600',
              }}
            >
              {t('header.calculate')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
