import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeason } from '../../hooks/useSeason';
import { LoginButton } from '../auth/LoginButton';
import { UserMenu } from '../auth/UserMenu';
import { Route, Sun, Moon } from 'lucide-react';

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

  const isHomePage = location.pathname === '/';

  const handleCreateTripClick = () => {
    if (user) {
      navigate('/route-planner');
    }
  };

  return (
    <header
      className={`hero${isHomePage ? '' : ' hero--compact'}`}
      style={{ backgroundImage: `url(/images/${season}.webp)` }}
    >
      <div className="hero-scrim" aria-hidden="true" />
      <div className="container hero-inner">
        <div className="topbar">
          <button
            type="button"
            className="brand"
            onClick={() => navigate('/')}
            title={t('header.nav.home')}
          >
            <Route size={20} strokeWidth={2.25} aria-hidden="true" />
            <span>Trip Calculate</span>
          </button>

          <div className="topbar-controls">
            <div className="seg" role="group" aria-label="Language">
              <button
                type="button"
                className={language === 'en' ? 'seg-on' : ''}
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
              >
                EN
              </button>
              <button
                type="button"
                className={language === 'uk' ? 'seg-on' : ''}
                onClick={() => setLanguage('uk')}
                aria-pressed={language === 'uk'}
              >
                UA
              </button>
            </div>

            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {!loading && (user ? <UserMenu /> : <LoginButton />)}
          </div>
        </div>

        {isHomePage && (
          <div className="hero-content">
            <h1>{t('header.title')}</h1>
            <p className="hero-sub">{t('header.tagline')}</p>
            <div className="hero-actions">
              <button
                id="create-trip-btn"
                className={`btn${!user ? ' inactive' : ''}`}
                onClick={handleCreateTripClick}
                disabled={!user}
                title={!user ? t('header.loginRequired') : undefined}
              >
                {t('header.createTrip')}
              </button>
              <button className="btn btn-secondary" onClick={onCalculateClick}>
                {t('header.calculate')}
              </button>
            </div>
            {!user && !loading && <p className="hero-hint">{t('header.signInHint')}</p>}
          </div>
        )}
      </div>
    </header>
  );
}
