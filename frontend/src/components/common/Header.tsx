import { Link, useLocation } from 'react-router-dom';
import { Brand, TopbarControls } from './AppHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeason, seasonAssets } from '../../hooks/useSeason';
import { withLocalePrefix } from '../../utils/locale';

interface HeaderProps {
  onCalculateClick?: () => void;
  /** Guest tap on "Create a trip": lets the page show a sign-in preview first. Defaults to going straight to login. */
  onGuestCreateTrip?: () => void;
}

export function Header({ onCalculateClick, onGuestCreateTrip }: HeaderProps) {
  const location = useLocation();
  const { user, loading, login } = useAuth();
  const { language, t } = useLanguage();
  const art = seasonAssets[useSeason()];

  const isHomePage = location.pathname === withLocalePrefix('/', language);

  return (
    <header className={`hero${isHomePage ? '' : ' hero--compact'}`}>
      {/* One <picture> so the browser fetches only the orientation it shows;
          the old CSS background is gone so nothing downloads twice. */}
      <picture className="seasonal-hero-art" aria-hidden="true">
        <source media="(max-width: 767px)" srcSet={art.mobile} width={1024} height={1536} />
        <img src={art.desktop} alt="" width={2172} height={724} fetchPriority="high" decoding="async" />
      </picture>
      <div className="hero-scrim" aria-hidden="true" />
      <div className="container hero-inner">
        <div className="topbar">
          <Brand />
          <TopbarControls />
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
                <button id="create-trip-btn" type="button" className="btn" onClick={onGuestCreateTrip ?? login}>
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
