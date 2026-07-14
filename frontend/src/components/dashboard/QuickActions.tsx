import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation, Calculator, Download, Trash2, Loader2 } from 'lucide-react';
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
import { dashboardService } from '../../services/dashboardService';
import { useLanguage } from '../../contexts/LanguageContext';
import { withLocalePrefix } from '../../utils/locale';

export function QuickActions() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);


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
      onClick: () => navigate(withLocalePrefix('/route-planner', language)),
      destructive: false,
      show: true,
    },
    {
      icon: Calculator,
      label: t('dashboard.quickActions.calculateTrip'),
      description: t('dashboard.quickActions.calculateTripDesc'),
      onClick: () => navigate(withLocalePrefix('/', language)),
      destructive: false,
      show: true,
    },

    {
      icon: Download,
      label: t('dashboard.quickActions.downloadData'),
      description: t('dashboard.quickActions.downloadDataDesc'),
      onClick: handleDownloadData,
      destructive: false,
      show: true,
    },
    {
      icon: Trash2,
      label: t('dashboard.quickActions.deleteAccount'),
      description: t('dashboard.quickActions.deleteAccountDesc'),
      onClick: () => setDeleteDialogOpen(true),
      destructive: true,
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
              const iconColor = action.destructive
                ? 'text-red-600 dark:text-red-400'
                : 'text-primary';
              return (
                <button
                  key={index}
                  onClick={action.onClick}
                  className="w-full flex items-center p-3 rounded-lg border border-gray-200/60 dark:border-gray-700/60 glass-inset hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div className="ml-3 text-left flex-1">
                    <p
                      className={`text-sm font-medium ${
                        action.destructive
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
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
