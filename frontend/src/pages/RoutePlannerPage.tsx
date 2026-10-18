import { RoutePlanner } from '../components/RoutePlanner';
import { AppHeader } from '../components/common/AppHeader';
import { SkipLink } from '../components/common/PageShell';
import { Header } from '../components/common/Header';
import { PlannerGuestPreview } from '../components/PlannerGuestPreview';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Loader2 } from 'lucide-react';

export function RoutePlannerPage() {
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  useDocumentTitle(t('pageTitle.routePlanner'));

  // Guests get a finished sample trip (not the real AI endpoint — that
  // stays authenticated-only) instead of a sales pitch next to an empty
  // 0 km / 0.00 calculator.
  if (!authLoading && !user) {
    return (
      <>
        <SkipLink />
        <Header />
        <main id="main" tabIndex={-1}>
          <PlannerGuestPreview />
        </main>
      </>
    );
  }

  if (authLoading) {
    return (
      <>
        <SkipLink />
        <Header />
        <main id="main" tabIndex={-1} className="flex items-center justify-center min-h-screen" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">{t('common.loading')}</span>
        </main>
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <SkipLink />
      <AppHeader />
      <main id="main" tabIndex={-1} className="flex-1 overflow-hidden">
        {/* h1 lives in WelcomeScreen (visible) or RoutePlanner (sr-only dashboard) */}
        <RoutePlanner />
      </main>
    </div>
  );
}