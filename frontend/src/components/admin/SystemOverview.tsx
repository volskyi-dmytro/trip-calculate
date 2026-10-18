import { useEffect, useState } from 'react';
import { Users, UserCheck, UserPlus, Navigation, MapPin, Clock, CheckCircle, Brain, AlertCircle, Database } from 'lucide-react';
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
        <p className="text-secondary">
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
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: t('admin.overview.activeUsers'),
      value: stats.activeUsers,
      icon: UserCheck,
      color: 'text-success',
      bgColor: 'bg-success-soft',
    },
    {
      label: t('admin.overview.totalRoutes'),
      value: stats.totalRoutes,
      icon: Navigation,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: t('admin.overview.totalWaypoints'),
      value: stats.totalWaypoints,
      icon: MapPin,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: t('admin.overview.pendingRequests'),
      value: stats.pendingAccessRequests,
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning-soft',
    },
    {
      label: t('admin.overview.usersWithAccess'),
      value: stats.usersWithRoutePlanner,
      icon: CheckCircle,
      color: 'text-primary',
      bgColor: 'bg-primary-soft',
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
                    <p className="text-sm text-secondary mb-1">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-content">
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
            <div className="text-center p-4 glass-inset rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {stats.newUsersLast24h}
              </p>
              <p className="text-sm text-secondary mt-1">
                {t('admin.overview.last24h')}
              </p>
            </div>
            <div className="text-center p-4 glass-inset rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {stats.newUsersLast7d}
              </p>
              <p className="text-sm text-secondary mt-1">
                {t('admin.overview.last7d')}
              </p>
            </div>
            <div className="text-center p-4 glass-inset rounded-lg">
              <p className="text-2xl font-bold text-success">
                {stats.newUsersLast30d}
              </p>
              <p className="text-sm text-secondary mt-1">
                {t('admin.overview.last30d')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Usage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brain className="h-5 w-5 mr-2" />
            AI Usage Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-primary/5 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {stats.aiRequestsLast24h}
              </p>
              <p className="text-sm text-secondary mt-1">
                Requests (24h)
              </p>
            </div>
            <div className="text-center p-4 bg-primary/5 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {stats.aiRequestsLastMonth}
              </p>
              <p className="text-sm text-secondary mt-1">
                Requests (30d)
              </p>
            </div>
            <div className="text-center p-4 bg-success-soft rounded-lg">
              <p className="text-2xl font-bold text-success">
                {(stats.aiCacheHitRate * 100).toFixed(1)}%
              </p>
              <p className="text-sm text-secondary mt-1">
                Cache Hit Rate
              </p>
            </div>
            <div className="text-center p-4 bg-danger-soft rounded-lg">
              <p className="text-2xl font-bold text-danger">
                {(stats.aiErrorRate * 100).toFixed(1)}%
              </p>
              <p className="text-sm text-secondary mt-1">
                Error Rate
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="text-center p-4 glass-inset rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold text-primary">
                {stats.aiUniqueUsersLast24h}
              </p>
              <p className="text-sm text-secondary mt-1">
                Unique Users (24h)
              </p>
            </div>
            <div className="text-center p-4 glass-inset rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Database className="h-5 w-5 text-info" />
              </div>
              <p className="text-2xl font-bold text-info">
                {stats.aiTotalCachedResponses}
              </p>
              <p className="text-sm text-secondary mt-1">
                Cached Responses
              </p>
            </div>
            <div className="text-center p-4 glass-inset rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <AlertCircle className="h-5 w-5 text-warning" />
              </div>
              <p className="text-2xl font-bold text-warning">
                {stats.aiRateLimitHits24h}
              </p>
              <p className="text-sm text-secondary mt-1">
                Rate Limit Hits (24h)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
