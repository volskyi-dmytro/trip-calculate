import { Link, useLocation } from 'react-router-dom';
import { Brand, TopbarControls } from './AppHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeason, seasonAssets } from '../../hooks/useSeason';
import { withLocalePrefix } from '../../utils/locale';
import { prefetchRoutePlanner } from '../../utils/plannerChunk';
import { track } from '../../lib/analytics';

const prefetchProps = {
  onMouseEnter: prefetchRoutePlanner,
  onFocus: prefetchRoutePlanner,
  onTouchStart: prefetchRoutePlanner,
};

/** Hero "I already know the distance": jump to the one inline calculator
 *  instead of opening a second, different calculator in a dialog. */
function focusQuickCalculator() {
  const field = document.getElementById('quick-distance') as HTMLInputElement | null;
  if (!field) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  field.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  field.focus({ preventScroll: true });
  field.select();
}

export function Header() {
  const location = useLocation();
  const { user, loading } = useAuth();
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
              {/* The planner opens for guests too (manual planning); sign-in is
                  asked for only when they save or use AI. */}
              <Link
                id="create-trip-btn"
                className="btn"
                {...prefetchProps}
                to={withLocalePrefix('/route-planner', language)}
                onClick={() => track('cta_click', { location: 'hero', label: 'plan_trip', signed_in: Boolean(user) })}
              >
                {t('header.createTrip')}
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { track('cta_click', { location: 'hero', label: 'know_distance' }); focusQuickCalculator(); }}
              >
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
