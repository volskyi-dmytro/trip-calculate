import { format } from 'date-fns';
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
import { timeAgo } from '../../i18n/dates';

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
  const { t, language } = useLanguage();

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
            <h3 className="text-sm font-semibold text-content mb-3">
              {t('admin.userDetails.basicInfo')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <User className="h-4 w-4 mr-3 text-caption" />
                <div className="flex-1">
                  <span className="text-secondary">
                    {t('admin.userDetails.name')}:
                  </span>
                  <span className="ml-2 text-content">
                    {user.name}
                  </span>
                </div>
              </div>

              {user.displayName && (
                <div className="flex items-center text-sm">
                  <User className="h-4 w-4 mr-3 text-caption" />
                  <div className="flex-1">
                    <span className="text-secondary">
                      {t('admin.userDetails.displayName')}:
                    </span>
                    <span className="ml-2 text-content">
                      {user.displayName}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center text-sm">
                <Mail className="h-4 w-4 mr-3 text-caption" />
                <div className="flex-1">
                  <span className="text-secondary">
                    {t('admin.userDetails.email')}:
                  </span>
                  <span className="ml-2 text-content">
                    {user.email}
                  </span>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <Shield className="h-4 w-4 mr-3 text-caption" />
                <div className="flex-1">
                  <span className="text-secondary">
                    {t('admin.userDetails.role')}:
                  </span>
                  <span
                    className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'ADMIN'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-inset text-secondary'
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
            <h3 className="text-sm font-semibold text-content mb-3">
              {t('admin.userDetails.accountInfo')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-3 text-caption" />
                <div className="flex-1">
                  <span className="text-secondary">
                    {t('admin.userDetails.createdAt')}:
                  </span>
                  <span className="ml-2 text-content">
                    {format(new Date(user.createdAt), 'PPpp')}
                    <span className="text-caption text-xs ml-2">
                      ({timeAgo(user.createdAt, language)})
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-3 text-caption" />
                <div className="flex-1">
                  <span className="text-secondary">
                    {t('admin.userDetails.lastLogin')}:
                  </span>
                  <span className="ml-2 text-content">
                    {timeAgo(user.lastLogin, language)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Access */}
          <div>
            <h3 className="text-sm font-semibold text-content mb-3">
              {t('admin.userDetails.featureAccess')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg glass-inset">
                <div className="flex items-center">
                  <Navigation className="h-4 w-4 mr-3 text-caption" />
                  <span className="text-sm text-content">
                    {t('admin.userDetails.routePlanner')}
                  </span>
                </div>
                {user.routePlannerAccess ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-soft text-success">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {t('admin.userDetails.granted')}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-inset text-secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    {t('admin.userDetails.notGranted')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          <div>
            <h3 className="text-sm font-semibold text-content mb-3">
              {t('admin.userDetails.usageStats')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-primary/5 text-center">
                <p className="text-2xl font-bold text-primary">
                  {user.routeCount}
                </p>
                <p className="text-xs text-secondary mt-1">
                  {t('admin.userDetails.totalRoutes')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 text-center">
                <p className="text-2xl font-bold text-primary">
                  {user.id}
                </p>
                <p className="text-xs text-secondary mt-1">
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
