import { formatDistanceToNow, format } from 'date-fns';
import { User, Mail, Calendar, Shield, Navigation, CheckCircle, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { UserManagement } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';

interface UserDetailsModalProps {
  user: UserManagement;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: () => void;
}

export function UserDetailsModal({
  user,
  isOpen,
  onClose,
}: UserDetailsModalProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('admin.userDetails.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.userDetails.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              {t('admin.userDetails.basicInfo')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <User className="h-4 w-4 mr-3 text-gray-400" />
                <div className="flex-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('admin.userDetails.name')}:
                  </span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {user.name}
                  </span>
                </div>
              </div>

              {user.displayName && (
                <div className="flex items-center text-sm">
                  <User className="h-4 w-4 mr-3 text-gray-400" />
                  <div className="flex-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('admin.userDetails.displayName')}:
                    </span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {user.displayName}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center text-sm">
                <Mail className="h-4 w-4 mr-3 text-gray-400" />
                <div className="flex-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('admin.userDetails.email')}:
                  </span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {user.email}
                  </span>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <Shield className="h-4 w-4 mr-3 text-gray-400" />
                <div className="flex-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('admin.userDetails.role')}:
                  </span>
                  <span
                    className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'ADMIN'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              {t('admin.userDetails.accountInfo')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-3 text-gray-400" />
                <div className="flex-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('admin.userDetails.createdAt')}:
                  </span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {format(new Date(user.createdAt), 'PPpp')}
                    <span className="text-gray-500 dark:text-gray-400 text-xs ml-2">
                      ({formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })})
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-3 text-gray-400" />
                <div className="flex-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('admin.userDetails.lastLogin')}:
                  </span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Access */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              {t('admin.userDetails.featureAccess')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center">
                  <Navigation className="h-4 w-4 mr-3 text-gray-400" />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {t('admin.userDetails.routePlanner')}
                  </span>
                </div>
                {user.routePlannerAccess ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {t('admin.userDetails.granted')}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    <XCircle className="h-3 w-3 mr-1" />
                    {t('admin.userDetails.notGranted')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              {t('admin.userDetails.usageStats')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {user.routeCount}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {t('admin.userDetails.totalRoutes')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {user.id}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {t('admin.userDetails.userId')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>{t('admin.userDetails.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
