import { useLanguage } from '../contexts/LanguageContext';
import { QuickCalculator } from './QuickCalculator';
import { PlannerPromo } from './PlannerPromo';

export function LandingView() {
  const { t: tr } = useLanguage();

  const t = {
    heading1: tr('landing.heading1'),
    heading2: tr('landing.heading2'),
    subtitle: tr('landing.subtitle'),
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-white mb-4">
            {t.heading1}{' '}
            <span className="text-primary">{t.heading2}</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Two-Column Layout */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Left: Quick Calculator */}
          <div className="flex items-start">
            <QuickCalculator />
          </div>

          {/* Right: Free planner promo */}
          <div className="flex items-start">
            <PlannerPromo />
          </div>
        </div>
      </div>
    </div>
  );
}
