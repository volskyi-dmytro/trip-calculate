import { useEffect, useState } from 'react';
import { Users, UserCheck, UserPlus, Navigation, MapPin, Clock, CheckCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { adminService, type AdminStats } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';

export function SystemOverview() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await adminService.getSystemStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
      toast.error(t('admin.overview.error.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">
          {t('admin.overview.error.noData')}
        </p>
      </div>
    );
  }

  const statCards = [
    {
      label: t('admin.overview.totalUsers'),
      value: stats.totalUsers,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      label: t('admin.overview.activeUsers'),
      value: stats.activeUsers,
      icon: UserCheck,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
    },
    {
      label: t('admin.overview.totalRoutes'),
      value: stats.totalRoutes,
      icon: Navigation,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      label: t('admin.overview.totalWaypoints'),
      value: stats.totalWaypoints,
      icon: MapPin,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
    },
    {
      label: t('admin.overview.pendingRequests'),
      value: stats.pendingAccessRequests,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    },
    {
      label: t('admin.overview.usersWithAccess'),
      value: stats.usersWithRoutePlanner,
      icon: CheckCircle,
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-100 dark:bg-teal-900/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <Icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* New Users Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserPlus className="h-5 w-5 mr-2" />
            {t('admin.overview.newUsers')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.newUsersLast24h}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('admin.overview.last24h')}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {stats.newUsersLast7d}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('admin.overview.last7d')}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.newUsersLast30d}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('admin.overview.last30d')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
