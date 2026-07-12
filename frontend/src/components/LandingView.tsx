import { useLanguage } from '../contexts/LanguageContext';
import { QuickCalculator } from './QuickCalculator';
import { PremiumPromo } from './PremiumPromo';

export function LandingView() {
  const { language } = useLanguage();

  const t = {
    heading1: language === 'uk' ? 'Плануйте маршрути' : 'Plan multi-stop road trips',
    heading2: language === 'uk' ? 'з кількома зупинками.' : 'with real road data.',
    subtitle: language === 'uk'
      ? 'Будуйте маршрут на мапі, отримуйте реальні відстані та час у дорозі, розраховуйте вартість пального в реальному часі та експортуйте маршрут у Waze.'
      : 'Build your route on the map, get real road distances and drive times, estimate fuel costs in real time, and export to Waze for turn-by-turn navigation.',
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

          {/* Right: Premium Promo */}
          <div className="flex items-start">
            <PremiumPromo />
          </div>
        </div>
      </div>
    </div>
  );
}
