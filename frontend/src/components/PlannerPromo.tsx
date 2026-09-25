import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Save, Navigation, Sparkles, Chrome, Car } from 'lucide-react';

export function PlannerPromo() {
  const { t: tr } = useLanguage();
  const { login } = useAuth();

  const t = {
    title: tr('plannerPromo.title'),
    features: {
      visualRoute: tr('plannerPromo.visualRoute'),
      saveHistory: tr('plannerPromo.saveHistory'),
      carGarage: tr('plannerPromo.carGarage'),
      wazeIntegration: tr('plannerPromo.wazeIntegration'),
      aiInsights: tr('plannerPromo.aiInsights'),
    },
    signInButton: tr('plannerPromo.signInButton'),
    freeNote: tr('plannerPromo.freeNote'),
  };

  return (
    <Card className="p-6 w-full">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t.title}</h2>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {[
          { icon: MapPin, label: t.features.visualRoute },
          { icon: Save, label: t.features.saveHistory },
          { icon: Car, label: t.features.carGarage },
          { icon: Navigation, label: t.features.wazeIntegration },
          { icon: Sparkles, label: t.features.aiInsights },
        ].map(({ icon: Icon, label }) => (
          <div className="flex items-start gap-3" key={label}>
            <Icon className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
          </div>
        ))}
      </div>

      <Button onClick={login} className="w-full py-6 text-base font-semibold" size="lg">
        <Chrome className="w-5 h-5 mr-2" />
        {t.signInButton}
      </Button>

      <p className="text-xs text-center mt-3 text-gray-500 dark:text-gray-400">{t.freeNote}</p>
    </Card>
  );
}
