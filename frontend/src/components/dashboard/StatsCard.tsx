import { MapPin, Navigation, DollarSign, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { UserStats } from '../../services/dashboardService';
import { useLanguage } from '../../contexts/LanguageContext';

interface StatsCardProps {
  stats: UserStats;
}

export function StatsCard({ stats }: StatsCardProps) {
  const { t } = useLanguage();

  const statItems = [
    {
      label: t('dashboard.stats.totalRoutes'),
      value: stats.totalRoutes,
      icon: Navigation,
    },
    {
      label: t('dashboard.stats.totalDistance'),
      value: `${stats.totalDistance.toFixed(1)} km`,
      icon: MapPin,
    },
    {
      label: t('dashboard.stats.totalFuelCost'),
      value: `${stats.mostUsedCurrency || '$'}${stats.totalFuelCost.toFixed(2)}`,
      icon: DollarSign,
    },
    {
      label: t('dashboard.stats.accountAge'),
      value: `${stats.accountAgeDays} ${t('dashboard.stats.days')}`,
      icon: Calendar,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('dashboard.stats.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {statItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="flex items-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div
                  className="p-2.5 rounded-lg mr-4"
                  style={{ background: 'var(--accent-soft)' }}
                >
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {item.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                    {item.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
