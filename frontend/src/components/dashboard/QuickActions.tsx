import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation, Calculator, Download, Trash2, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { dashboardService, type UserProfile } from '../../services/dashboardService';
import { routeService } from '../../services/routeService';
import { useLanguage } from '../../contexts/LanguageContext';

interface QuickActionsProps {
  profile: UserProfile;
}

export function QuickActions({ profile }: QuickActionsProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      await routeService.requestAccess();
      toast.success(t('dashboard.quickActions.requestAccessSuccess'));
    } catch (error) {
      console.error('Failed to request access:', error);
      toast.error(t('dashboard.quickActions.requestAccessError'));
    } finally {
      setRequesting(false);
    }
  };

  const handleDownloadData = async () => {
    try {
      // This would need to be implemented on the backend
      toast.info(t('dashboard.quickActions.downloadDataInfo'));
    } catch (error) {
      console.error('Failed to download data:', error);
      toast.error(t('dashboard.quickActions.downloadDataError'));
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await dashboardService.deleteAccount();
      toast.success(t('dashboard.quickActions.deleteAccountSuccess'));
      // Redirect to home after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      console.error('Failed to delete account:', error);
      toast.error(t('dashboard.quickActions.deleteAccountError'));
      setDeleting(false);
    }
  };

  const actions = [
    {
      icon: Navigation,
      label: t('dashboard.quickActions.createRoute'),
      description: t('dashboard.quickActions.createRouteDesc'),
      onClick: () => navigate('/route-planner'),
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      show: profile.routePlannerAccess,
    },
    {
      icon: Calculator,
      label: t('dashboard.quickActions.calculateTrip'),
      description: t('dashboard.quickActions.calculateTripDesc'),
      onClick: () => navigate('/'),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      show: true,
    },
    {
      icon: Send,
      label: t('dashboard.quickActions.requestAccess'),
      description: t('dashboard.quickActions.requestAccessDesc'),
      onClick: handleRequestAccess,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      show: !profile.routePlannerAccess,
      loading: requesting,
    },
    {
      icon: Download,
      label: t('dashboard.quickActions.downloadData'),
      description: t('dashboard.quickActions.downloadDataDesc'),
      onClick: handleDownloadData,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      show: true,
    },
    {
      icon: Trash2,
      label: t('dashboard.quickActions.deleteAccount'),
      description: t('dashboard.quickActions.deleteAccountDesc'),
      onClick: () => setDeleteDialogOpen(true),
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      show: true,
    },
  ];

  const visibleActions = actions.filter((action) => action.show);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('dashboard.quickActions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {visibleActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={action.onClick}
                  disabled={action.loading}
                  className={`w-full flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all ${action.bgColor}`}
                >
                  <div className="flex-shrink-0">
                    {action.loading ? (
                      <Loader2 className={`h-5 w-5 ${action.color} animate-spin`} />
                    ) : (
                      <Icon className={`h-5 w-5 ${action.color}`} />
                    )}
                  </div>
                  <div className="ml-3 text-left flex-1">
                    <p className={`text-sm font-medium ${action.color}`}>
                      {action.label}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {action.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400">
              {t('dashboard.quickActions.deleteAccountTitle')}
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-2">
                <p className="font-semibold">
                  {t('dashboard.quickActions.deleteAccountWarning')}
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>{t('dashboard.quickActions.deleteAccountWarning1')}</li>
                  <li>{t('dashboard.quickActions.deleteAccountWarning2')}</li>
                  <li>{t('dashboard.quickActions.deleteAccountWarning3')}</li>
                </ul>
                <p className="text-sm pt-2">
                  {t('dashboard.quickActions.deleteAccountConfirm')}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {t('dashboard.quickActions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dashboard.quickActions.deleting')}
                </>
              ) : (
                t('dashboard.quickActions.deleteAccount')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
