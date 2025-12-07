import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Save, Navigation, Sparkles, Chrome } from 'lucide-react';

export function PremiumPromo() {
  const { language } = useLanguage();
  const { login } = useAuth();

  const t = {
    title: language === 'uk' ? 'Преміум-версія' : 'Go Premium',
    features: {
      visualRoute: language === 'uk' ? 'Візуальне планування маршруту' : 'Visual Route Planning',
      saveHistory: language === 'uk' ? 'Збереження історії поїздок' : 'Save Trip History',
      wazeIntegration: language === 'uk' ? 'Інтеграція з Waze' : 'Direct Waze Integration',
      aiInsights: language === 'uk' ? 'AI-інсайти' : 'AI-Powered Insights',
    },
    signInButton: language === 'uk' ? 'Увійти через Google' : 'Sign In with Google',
    noCard: language === 'uk' ? 'Кредитна картка не потрібна для демо' : 'No credit card required for demo',
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-indigo-900 to-purple-900 text-white border-2 border-indigo-700">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-yellow-300" />
          </div>
          <h3 className="text-xl font-bold">{t.title}</h3>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <MapPin className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{t.features.visualRoute}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Save className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{t.features.saveHistory}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Navigation className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{t.features.wazeIntegration}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{t.features.aiInsights}</p>
          </div>
        </div>
      </div>

      <Button
        onClick={login}
        className="w-full bg-white text-indigo-900 hover:bg-gray-100 font-semibold py-6 text-base"
        size="lg"
      >
        <Chrome className="w-5 h-5 mr-2" />
        {t.signInButton}
      </Button>

      <p className="text-xs text-center mt-3 text-white/70">{t.noCard}</p>
    </Card>
  );
}
