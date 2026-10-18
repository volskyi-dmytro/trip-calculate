import { Link, useLocation } from 'react-router-dom';
import { Route, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { LoginButton } from '../auth/LoginButton';
import { UserMenu } from '../auth/UserMenu';
import { withLocalePrefix, otherLocale } from '../../utils/locale';

/** Language switch, theme toggle and account control, shared by every page header. */
export function TopbarControls() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, t } = useLanguage();

  const otherLang = otherLocale(language);
  // Keep ?routeId=… and #anchors: switching language must not lose the loaded route.
  const otherLangPath = withLocalePrefix(location.pathname, otherLang) + location.search + location.hash;

  return (
    <div className="topbar-controls">
      <div className="seg" role="group" aria-label={t('common.language')}>
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
        aria-label={t(theme === 'dark' ? 'common.theme.toLight' : 'common.theme.toDark')}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {!loading && user && (
        <nav className="topbar-nav" aria-label={t('header.nav.label')}>
          <Link
            to={withLocalePrefix('/route-planner', language)}
            aria-current={location.pathname === withLocalePrefix('/route-planner', language) ? 'page' : undefined}
          >
            {t('header.nav.planTrip')}
          </Link>
          <Link
            to={withLocalePrefix('/dashboard', language)}
            aria-current={location.pathname === withLocalePrefix('/dashboard', language) ? 'page' : undefined}
          >
            {t('header.nav.myTrips')}
          </Link>
        </nav>
      )}

      {!loading && (user ? <UserMenu /> : <LoginButton />)}
    </div>
  );
}

export function Brand() {
  const { language, t } = useLanguage();
  return (
    <Link to={withLocalePrefix('/', language)} className="brand" title={t('header.nav.home')}>
      <Route size={20} strokeWidth={2.25} aria-hidden="true" />
      <span>Trip Calculate</span>
    </Link>
  );
}

/** Slim header for full-viewport screens (the planner); same controls as the hero Header. */
export function AppHeader() {
  return (
    <header className="glass-topbar app-bar flex-shrink-0 px-4" style={{ zIndex: 50 }}>
      <div className="topbar">
        <Brand />
        <TopbarControls />
      </div>
    </header>
  );
}