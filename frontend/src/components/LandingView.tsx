import { useLanguage } from '../contexts/LanguageContext';
import { QuickCalculator } from './QuickCalculator';
import { PremiumPromo } from './PremiumPromo';

export function LandingView() {
  const { language } = useLanguage();

  const t = {
    heading1: language === 'uk' ? 'Розрахуйте витрати на паливо' : 'Calculate fuel costs',
    heading2: language === 'uk' ? 'за секунди.' : 'in seconds.',
    subtitle: language === 'uk'
      ? 'Плануйте бюджет вашої подорожі з точністю. Отримуйте оцінки витрат на паливо в реальному часі та безшовну інтеграцію з Waze.'
      : 'Plan your road trip budget with accuracy. Get real-time fuel estimates and seamless Waze integration.',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-white mb-4">
            {t.heading1}{' '}
            <span className="text-green-500">{t.heading2}</span>
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
