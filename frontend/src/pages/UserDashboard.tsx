import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dashboardService, type UserDashboard as UserDashboardData } from '../services/dashboardService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { withLocalePrefix } from '../utils/locale';
import { track } from '../lib/analytics';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageShell } from '../components/common/PageShell';
import { ProfileCard } from '../components/dashboard/ProfileCard';
import { StatsCard } from '../components/dashboard/StatsCard';
import { RoutesList } from '../components/dashboard/RoutesList';
import { ReceiptsList } from '../components/dashboard/ReceiptsList';
import { QuickActions } from '../components/dashboard/QuickActions';
import { CarsCard } from '../components/dashboard/CarsCard';
import { SecuritySection } from '../components/dashboard/SecuritySection';
import { NextTripBanner } from '../components/dashboard/NextTripBanner';

/** Signed-out visitors get a reason and a way in, not "No data" plus an error toast. */
function SignedOutDashboard() {
  const { t, language } = useLanguage();
  const { login } = useAuth();
  return (
    <PageShell>
      <div className="flex justify-center px-4" style={{ padding: "64px 16px" }}>
        <div className="glass-panel rounded-xl p-8 max-w-md w-full text-center space-y-4">
          <FolderOpen className="h-10 w-10 mx-auto text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.signedOut.title')}</h1>
          <p className="text-gray-600 dark:text-gray-300">{t('dashboard.signedOut.text')}</p>
          <button type="button" className="btn w-full" onClick={() => login(undefined, 'dashboard')}>
            {t('header.login')}
          </button>
          <Link className="inline-flex min-h-11 items-center text-sm text-primary hover:underline" to={withLocalePrefix('/route-planner', language)}>
            {t('dashboard.signedOut.plan')}
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

export function UserDashboard() {
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  useDocumentTitle(t('dashboard.title'));
  const [dashboardData, setDashboardData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    track('dashboard_view', { signed_in: Boolean(user) });
    if (user) fetchDashboard();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per sign-in state
  }, [authLoading, user]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await dashboardService.getDashboard();
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      toast.error(t('dashboard.error.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!authLoading && !user) return <SignedOutDashboard />;

  if (authLoading || loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center min-h-screen" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      </PageShell>
    );
  }

  if (!dashboardData) {
    return (
      <PageShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-lg text-muted-foreground">{t('dashboard.error.noData')}</p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {t('dashboard.subtitle')}
          </p>
        </div>

        <NextTripBanner />

        {/* Below lg the two column wrappers dissolve (display: contents) so
            every card is a direct item of the one-column grid and `order`
            can put saved routes near the top on phones instead of after
            profile, quick actions and cars. From lg the columns are normal
            blocks again and the order classes have no effect. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Profile & Quick Actions */}
          <div className="contents lg:block lg:space-y-6">
            <div className="order-6">
              <ProfileCard
                profile={dashboardData.profile}
                onProfileUpdate={fetchDashboard}
              />
            </div>
            <div className="order-3">
              <QuickActions />
            </div>
            <div className="order-4">
              <CarsCard />
            </div>
          </div>

          {/* Middle & Right Columns - Stats & Routes */}
          <div className="contents lg:block lg:col-span-2 lg:space-y-6">
            <div className="order-1">
              <StatsCard stats={dashboardData.stats} />
            </div>
            <div className="order-2">
              <RoutesList
                routes={dashboardData.recentRoutes}
                onRouteDeleted={fetchDashboard}
              />
            </div>
            <div className="order-5">
              <ReceiptsList />
            </div>
            <div className="order-7">
              <SecuritySection />
            </div>
          </div>
        </div>
        </div>
      </div>
    </PageShell>
  );
}
