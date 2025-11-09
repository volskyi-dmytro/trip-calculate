import { useEffect, useState } from 'react';
import { RoutePlanner } from '../components/RoutePlanner';
import { routeService } from '../services/routeService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin, Navigation } from 'lucide-react';

export function RoutePlannerPage() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const access = await routeService.checkAccess();
      setHasAccess(access);
    } catch (error) {
      console.error('Failed to check access:', error);
      setHasAccess(false);
    }
  };

  const requestAccess = async () => {
    setRequesting(true);
    try {
      await routeService.requestAccess();
      setRequestSent(true);
    } catch (error) {
      alert('Failed to send request. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  // Loading state
  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No access - show request form
  if (!hasAccess) {
    return (
      <div className="container mx-auto max-w-2xl p-8">
        <Card className="border-2">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Navigation className="h-12 w-12 text-primary" />
              </div>
            </div>
            <CardTitle className="text-3xl">Interactive Route Planner</CardTitle>
            <CardDescription className="text-base mt-2">
              Premium feature for trip planning and cost calculation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!requestSent ? (
              <>
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Features:</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>Interactive map with drag-and-drop waypoints</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>Real-time distance and cost calculation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>Save and load routes from cloud</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>Export routes for navigation apps</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-1 text-primary" />
                      <span>Multi-stop route planning</span>
                    </li>
                  </ul>
                </div>

                <Alert>
                  <AlertDescription>
                    This feature is currently in beta testing. Request access to try it out!
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
                      Sending Request...
                    </>
                  ) : (
                    'Request Beta Access'
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  You'll receive an email confirmation when your request is approved
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
                <h3 className="text-xl font-semibold">Request Sent!</h3>
                <p className="text-muted-foreground">
                  Your request has been sent successfully. You'll receive an email notification 
                  when your access is approved.
                </p>
                <p className="text-sm text-muted-foreground">
                  This usually takes 1-2 business days.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Has access - show route planner
  return <RoutePlanner />;
}
