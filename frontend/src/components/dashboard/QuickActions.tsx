import { useNavigate } from 'react-router-dom';
import { Navigation, Calculator } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useLanguage } from '../../contexts/LanguageContext';
import { withLocalePrefix } from '../../utils/locale';

// Day-to-day actions only — account data export and deletion live in the
// Security section, next to the rest of the account/danger controls.
export function QuickActions() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const actions = [
    {
      icon: Navigation,
      label: t('dashboard.quickActions.createRoute'),
      description: t('dashboard.quickActions.createRouteDesc'),
      onClick: () => navigate(withLocalePrefix('/route-planner', language)),
    },
    {
      icon: Calculator,
      label: t('dashboard.quickActions.calculateTrip'),
      description: t('dashboard.quickActions.calculateTripDesc'),
      onClick: () => navigate(withLocalePrefix('/', language)),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('dashboard.quickActions.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                onClick={action.onClick}
                className="w-full flex items-center p-3 rounded-lg border border-gray-200/60 dark:border-gray-700/60 glass-inset hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
              >
                <div className="flex-shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="ml-3 text-left flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {action.label}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {action.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
