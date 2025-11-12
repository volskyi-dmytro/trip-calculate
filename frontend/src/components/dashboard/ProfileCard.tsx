import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { User, Calendar, Mail, Shield, CheckCircle, Clock, Edit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { UserProfile } from '../../services/dashboardService';
import { useLanguage } from '../../contexts/LanguageContext';
import { EditProfileModal } from './EditProfileModal';

interface ProfileCardProps {
  profile: UserProfile;
  onProfileUpdate: () => void;
}

export function ProfileCard({ profile, onProfileUpdate }: ProfileCardProps) {
  const { t } = useLanguage();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const getAccessStatusBadge = () => {
    if (profile.routePlannerAccess) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t('dashboard.profile.accessGranted')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
          <Clock className="h-3 w-3 mr-1" />
          {t('dashboard.profile.noAccess')}
        </span>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{t('dashboard.profile.title')}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center space-y-4">
            {/* Avatar */}
            <div className="relative">
              <img
                src={profile.pictureUrl}
                alt={profile.name}
                className="h-24 w-24 rounded-full border-4 border-white dark:border-gray-700 shadow-lg"
              />
              {profile.role === 'ADMIN' && (
                <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-1.5">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Name & Display Name */}
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {profile.displayName || profile.name}
              </h3>
              {profile.displayName && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {profile.name}
                </p>
              )}
            </div>

            {/* Details */}
            <div className="w-full space-y-3">
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                <Mail className="h-4 w-4 mr-2 text-gray-400" />
                <span className="truncate">{profile.email}</span>
              </div>

              <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                <span>
                  {t('dashboard.profile.joined')} {formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                <User className="h-4 w-4 mr-2 text-gray-400" />
                <span>
                  {t('dashboard.profile.lastLogin')} {formatDistanceToNow(new Date(profile.lastLogin), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center text-sm">
                <Shield className="h-4 w-4 mr-2 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-300 mr-2">
                  {t('dashboard.profile.routeAccess')}:
                </span>
                {getAccessStatusBadge()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isEditModalOpen && (
        <EditProfileModal
          profile={profile}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => {
            setIsEditModalOpen(false);
            onProfileUpdate();
          }}
        />
      )}
    </>
  );
}
