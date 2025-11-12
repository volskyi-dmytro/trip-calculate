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
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      label: t('dashboard.stats.totalDistance'),
      value: `${stats.totalDistance.toFixed(1)} km`,
      icon: MapPin,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
    },
    {
      label: t('dashboard.stats.totalFuelCost'),
      value: `${stats.mostUsedCurrency || '$'}${stats.totalFuelCost.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      label: t('dashboard.stats.accountAge'),
      value: `${stats.accountAgeDays} ${t('dashboard.stats.days')}`,
      icon: Calendar,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
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
                className="flex items-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
              >
                <div className={`p-3 rounded-full ${item.bgColor} mr-4`}>
                  <Icon className={`h-6 w-6 ${item.color}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {item.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
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
