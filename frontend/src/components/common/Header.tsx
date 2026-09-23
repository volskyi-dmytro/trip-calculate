import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeason } from '../../hooks/useSeason';
import { LoginButton } from '../auth/LoginButton';
import { UserMenu } from '../auth/UserMenu';
import { Route, Sun, Moon } from 'lucide-react';
import { withLocalePrefix, otherLocale } from '../../utils/locale';

interface HeaderProps {
  onCalculateClick?: () => void;
}

export function Header({ onCalculateClick }: HeaderProps) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, t } = useLanguage();
  const season = useSeason();

  const isHomePage = location.pathname === withLocalePrefix('/', language);
  const otherLang = otherLocale(language);
  const otherLangPath = withLocalePrefix(location.pathname, otherLang);

  return (
    <header
      className={`hero${isHomePage ? '' : ' hero--compact'}`}
      style={{ backgroundImage: `url(/images/${season}.webp)` }}
    >
      <div className="hero-scrim" aria-hidden="true" />
      <div className="container hero-inner">
        <div className="topbar">
          <Link to={withLocalePrefix('/', language)} className="brand" title={t('header.nav.home')}>
            <Route size={20} strokeWidth={2.25} aria-hidden="true" />
            <span>Trip Calculate</span>
          </Link>

          <div className="topbar-controls">
            <div className="seg" role="group" aria-label="Language">
              <Link
                to={language === 'en' ? location.pathname + location.search : otherLangPath}
                hrefLang="en"
                lang="en"
                className={language === 'en' ? 'seg-on' : ''}
                aria-current={language === 'en' ? 'true' : undefined}
              >
                EN
              </Link>
              <Link
                to={language === 'uk' ? location.pathname + location.search : otherLangPath}
                hrefLang="uk"
                lang="uk"
                className={language === 'uk' ? 'seg-on' : ''}
                aria-current={language === 'uk' ? 'true' : undefined}
              >
                UA
              </Link>
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
              {user ? (
                <Link id="create-trip-btn" className="btn" to={withLocalePrefix('/route-planner', language)}>
                  {t('header.createTrip')}
                </Link>
              ) : (
                <button
                  id="create-trip-btn"
                  type="button"
                  className="btn inactive"
                  disabled
                  title={t('header.loginRequired')}
                >
                  {t('header.createTrip')}
                </button>
              )}
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
