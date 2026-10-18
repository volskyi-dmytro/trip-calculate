import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RoutePlanner } from '../components/RoutePlanner';
import { AppHeader } from '../components/common/AppHeader';
import { SkipLink } from '../components/common/PageShell';
import { Header } from '../components/common/Header';
import { PlannerGuestPreview } from '../components/PlannerGuestPreview';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { track } from '../lib/analytics';
import { Loader2 } from 'lucide-react';

export function RoutePlannerPage() {
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  useDocumentTitle(t('pageTitle.routePlanner'));

  // ?sample=1: the finished static sample trip (what the AI produces). The AI
  // endpoint stays authenticated-only, so its numbers aren't computed by AI.
  const showSample = !user && searchParams.get('sample') === '1';
  const mode = authLoading ? null : showSample ? 'sample' : user ? 'signed_in' : 'guest';

  useEffect(() => {
    if (mode) track('planner_view', { mode });
  }, [mode]);

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

  if (showSample) {
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

  // Guests get the real planner in manual mode (map, routing, live fuel
  // price, receipts); sign-in is asked for only to save or to use AI.
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
