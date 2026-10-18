import { useNavigate } from 'react-router-dom';
import { Calculator } from 'lucide-react';
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
                className="w-full flex items-center p-3 rounded-lg border border-edge glass-inset hover:bg-surface transition-colors"
              >
                <div className="flex-shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="ml-3 text-left flex-1">
                  <p className="text-sm font-medium text-content">
                    {action.label}
                  </p>
                  <p className="text-xs text-secondary mt-0.5">
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
