import { Link } from 'react-router-dom';
import { RoutePlanner } from '../components/RoutePlanner';
import { Header } from '../components/common/Header';
import { LandingView } from '../components/LandingView';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { UserMenu } from '../components/auth/UserMenu';
import { withLocalePrefix } from '../utils/locale';
import { Loader2, Navigation, Sun, Moon } from 'lucide-react';

export function RoutePlannerPage() {
  const { language, setLanguage } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Google authentication remains the only route-planner access boundary.
  if (!authLoading && !user) {
    return (
      <>
        <Header />
        <LandingView />
      </>
    );
  }

  if (authLoading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div
        className="glass-topbar flex-shrink-0 flex items-center justify-between px-4"
        style={{ height: '56px', zIndex: 50 }}
      >
        <Link
          to={withLocalePrefix('/', language)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity no-underline"
          style={{ color: 'inherit' }}
        >
          <Navigation
            className="h-5 w-5"
            style={{ color: 'var(--nav-accent)' }}
            aria-hidden="true"
          />
          <span
            className="font-semibold text-sm tracking-wide"
            style={{ color: 'var(--nav-text-primary)' }}
          >
            Trip Calculate
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLanguage(language === 'en' ? 'uk' : 'en')}
            className="text-xs font-semibold px-2 py-1 rounded transition-colors"
            style={{
              color: 'var(--nav-text-secondary)',
              border: '1px solid var(--nav-border)',
              background: 'var(--nav-bg-input)',
            }}
          >
            {language === 'en' ? 'UA' : 'EN'}
          </button>

          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded transition-colors"
            style={{
              color: 'var(--nav-text-secondary)',
              border: '1px solid var(--nav-border)',
              background: 'var(--nav-bg-input)',
            }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {user && <UserMenu />}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <RoutePlanner />
      </div>
    </div>
  );
}
