import { useState } from 'react';
import { Shield, LogOut, Download, Trash2, Loader2 } from 'lucide-react';
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
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { dashboardService } from '../../services/dashboardService';
import { clearPlannerStorage } from '../../utils/plannerStorage';

export function SecuritySection() {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    logout();
  };

  const handleDownloadData = async () => {
    try {
      const blob = await dashboardService.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trip-calculate-data-${new Date().toISOString().slice(0, 10)}.json`;
      // Attached and revoked a tick later: some browsers (Safari, older
      // Firefox) cancel the download if the URL goes away during click().
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(t('dashboard.quickActions.downloadDataInfo'));
    } catch (error) {
      console.error('Failed to download data:', error);
      toast.error(t('dashboard.quickActions.downloadDataError'));
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await dashboardService.deleteAccount();
      // A deleted account shouldn't leave its route or AI answers in this browser.
      clearPlannerStorage();
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            {t('dashboard.security.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Authentication Provider */}
            <div className="flex items-center justify-between p-3 rounded-lg glass-inset border border-gray-200 dark:border-gray-700">
              <div className="flex items-center">
                <div className="flex-shrink-0 mr-3">
                  <img
                    src="/images/google-icon.svg"
                    alt="Google"
                    className="h-6 w-6"
                    onError={(e) => {
                      // Fallback if image doesn't exist
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('dashboard.security.provider')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Google OAuth 2.0
                  </p>
                </div>
              </div>
            </div>

            {/* Session Info */}
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p>
                <span className="font-medium">{t('dashboard.security.sessionExpires')}:</span>{' '}
                {t('dashboard.security.sessionDuration')}
              </p>
              <p className="text-xs">
                {t('dashboard.security.sessionNote')}
              </p>
            </div>

            {/* Logout Button */}
            <div className="pt-2">
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('dashboard.security.logout')}
              </Button>
            </div>

            {/* Account settings */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              {/* p, not h4/h1-h3: the global h1-h4 base rule sets an
                  unlayered color that beats Tailwind's layered utilities
                  (see CLAUDE.md), silently discarding text-gray-500 here. */}
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                {t('dashboard.security.accountSettings')}
              </p>
              <button
                onClick={handleDownloadData}
                className="w-full flex items-center p-3 rounded-lg border border-gray-200/60 dark:border-gray-700/60 glass-inset hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
              >
                <div className="flex-shrink-0">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div className="ml-3 text-left flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('dashboard.quickActions.downloadData')}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {t('dashboard.quickActions.downloadDataDesc')}
                  </p>
                </div>
              </button>
            </div>

            {/* Danger zone — visually separated, same confirmation as before */}
            <div className="pt-4 border-t border-red-200 dark:border-red-900/40">
              {/* p, not h4: see the account-settings label above.
                  --danger, not text-red-600: on this plain card surface
                  Tailwind's red-600/400 measures under 4.5:1 in light mode;
                  the calibrated --danger token clears it in both themes. */}
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--danger)' }}
              >
                {t('dashboard.security.dangerZone')}
              </p>
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="w-full flex items-center p-3 rounded-lg border border-red-200/60 dark:border-red-900/40 glass-inset hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <div className="flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="ml-3 text-left flex-1">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    {t('dashboard.quickActions.deleteAccount')}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {t('dashboard.quickActions.deleteAccountDesc')}
                  </p>
                </div>
              </button>
            </div>
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
