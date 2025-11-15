import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dashboardService, type UserDashboard as UserDashboardData } from '../services/dashboardService';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/common/Header';
import { ProfileCard } from '../components/dashboard/ProfileCard';
import { StatsCard } from '../components/dashboard/StatsCard';
import { RoutesList } from '../components/dashboard/RoutesList';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SecuritySection } from '../components/dashboard/SecuritySection';

export function UserDashboard() {
  const { t } = useLanguage();
  const [dashboardData, setDashboardData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

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

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!dashboardData) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-lg text-muted-foreground">{t('dashboard.error.noData')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {t('dashboard.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Profile & Quick Actions */}
          <div className="space-y-6">
            <ProfileCard
              profile={dashboardData.profile}
              onProfileUpdate={fetchDashboard}
            />
            <QuickActions profile={dashboardData.profile} />
          </div>

          {/* Middle & Right Columns - Stats & Routes */}
          <div className="lg:col-span-2 space-y-6">
            <StatsCard stats={dashboardData.stats} />
            <RoutesList
              routes={dashboardData.recentRoutes}
              onRouteDeleted={fetchDashboard}
            />
            <SecuritySection />
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
