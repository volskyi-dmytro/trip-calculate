import { useEffect, useState } from 'react';
import { RoutePlanner } from '../components/RoutePlanner';
import { Header } from '../components/common/Header';
import { LandingView } from '../components/LandingView';
import { useAuth } from '../contexts/AuthContext';
import { routeService } from '../services/routeService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation, type Language } from '../i18n/routePlanner';
import { toast } from 'sonner';
// AgentChat (LangGraph) is intentionally not mounted here pre-M6 — the agent
// container is not yet deployed by .github/workflows/deploy-prod.yml, so showing
// it would surface a broken endpoint to granted users. The n8n-backed TopChatBar
// inside <RoutePlanner /> remains the working chat per CLAUDE.md ("Until M6 ships,
// the existing n8n-backed beta AI features remain in place"). M6 deploy step
// will plumb the langgraph-agent container; re-import + re-mount AgentChat then.

export function RoutePlannerPage() {
  const { language } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const t = getTranslation(language as Language);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      console.log('Checking route planner access...');
      const access = await routeService.checkAccess();
      console.log('Route planner access result:', access);
      setHasAccess(access);
    } catch (error) {
      console.error('Failed to check route planner access:', error);
      // Fail closed: a transient access-check error must not auto-mount the AgentChat
      // (which would then attempt /api/ai/chat). Show the existing CTA path instead.
      setHasAccess(false);
    }
  };

  const requestAccess = async () => {
    setRequesting(true);
    try {
      console.log('Sending beta access request...');
      await routeService.requestAccess();
      console.log('Beta access request sent successfully');
      setRequestSent(true);
    } catch (error) {
      console.error('Failed to send beta access request:', error);

      // Handle duplicate request error (409 CONFLICT)
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number; data?: string } };
        if (axiosError.response?.status === 409) {
          // Show the specific error message from backend
          toast.error(axiosError.response.data || t.betaAccess.errorMessage);
          return;
        }
      }

      // Default error message for other errors
      toast.error(t.betaAccess.errorMessage);
    } finally {
      setRequesting(false);
    }
  };

  // Show landing page if user is not authenticated
  if (!authLoading && !user) {
    return (
      <>
        <Header />
        <LandingView />
      </>
    );
  }

  // Loading state
  if (hasAccess === null || authLoading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  // No access - show request form
  if (!hasAccess) {
    return (
      <>
        <Header />
        <div className="container mx-auto max-w-2xl p-8">
          <Card className="border-2">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Navigation className="h-12 w-12 text-primary" />
              </div>
            </div>
            <CardTitle className="text-3xl">{t.betaAccess.pageTitle}</CardTitle>
            <CardDescription className="text-base mt-2">
              {t.betaAccess.pageDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!requestSent ? (
              <>
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t.betaAccess.featuresTitle}</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>{t.betaAccess.features.interactive}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>{t.betaAccess.features.realtime}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>{t.betaAccess.features.saveLoad}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>{t.betaAccess.features.export}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>{t.betaAccess.features.multiStop}</span>
                    </li>
                  </ul>
                </div>

                <Alert>
                  <AlertDescription>
                    {t.betaAccess.betaNotice}
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={requestAccess}
                  disabled={requesting}
                  className="w-full"
                  size="lg"
                >
                  {requesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.betaAccess.sendingRequest}
                    </>
                  ) : (
                    t.betaAccess.requestButton
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  {t.betaAccess.emailNotice}
                </p>
              </>
            ) : (
              <div className="text-center space-y-4 py-8">
                <div className="flex justify-center">
                  <div className="p-4 bg-green-100 dark:bg-green-900/20 rounded-full">
                    <svg
                      className="h-12 w-12 text-green-600 dark:text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-semibold">{t.betaAccess.successTitle}</h3>
                <p className="text-muted-foreground">
                  {t.betaAccess.successMessage}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.betaAccess.successTiming}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </>
    );
  }

  // Has access - show route planner (which contains the n8n TopChatBar).
  // The new LangGraph-backed AgentChat is deferred to M6 — it lives at
  // src/components/ai/AgentChat.tsx and stays in the bundle so M6 only needs
  // to re-import + re-mount once the prod agent container is wired.
  return (
    <>
      <Header />
      <RoutePlanner />
    </>
  );
}
