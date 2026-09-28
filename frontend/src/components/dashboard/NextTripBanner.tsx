import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { withLocalePrefix } from '../../utils/locale';
import { Button } from '../ui/button';

/** Compact welcome/action banner, required directly under the dashboard
 *  heading. The illustration is decorative only (generic car, not the
 *  user's own) and never implies an actual route or vehicle. */
export function NextTripBanner() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="dashboard-next-trip-banner glass-panel rounded-lg border border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between gap-4 p-5 sm:p-6 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-1.5">
          {t('dashboard.banner.heading')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 max-w-md">
          {t('dashboard.banner.body')}
        </p>
        <Button onClick={() => navigate(withLocalePrefix('/route-planner', language))}>
          {t('dashboard.banner.cta')}
        </Button>
      </div>
      <img
        src="/images/dashboard-v1/next-trip.webp"
        alt=""
        width={640}
        height={427}
        loading="lazy"
        decoding="async"
        className="dashboard-next-trip-art"
      />
    </div>
  );
}
