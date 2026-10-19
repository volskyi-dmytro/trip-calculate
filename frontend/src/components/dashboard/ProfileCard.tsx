import { useState } from 'react';
import { User, Calendar, Mail, Edit, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { UserProfile } from '../../services/dashboardService';
import { useLanguage } from '../../contexts/LanguageContext';
import { EditProfileModal } from './EditProfileModal';
import { avatarProxyUrl } from '../../utils/avatar';
import { timeAgo } from '../../i18n/dates';

interface ProfileCardProps {
  profile: UserProfile;
  onProfileUpdate: () => void;
}

export function ProfileCard({ profile, onProfileUpdate }: ProfileCardProps) {
  const { t, language } = useLanguage();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{t('dashboard.profile.title')}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('dashboard.editProfile.title')}
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
              {profile.pictureUrl && !avatarFailed ? (
                <img
                  src={avatarProxyUrl(profile.pictureUrl)!}
                  alt={profile.name}
                  onError={() => setAvatarFailed(true)}
                  className="h-24 w-24 rounded-full border-4 border-edge shadow-lg object-cover"
                />
              ) : (
                <div className="h-24 w-24 rounded-full border-4 border-edge shadow-lg bg-primary flex items-center justify-center">
                  <User className="h-10 w-10 text-white" />
                </div>
              )}
              {profile.role === 'ADMIN' && (
                <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Name & Display Name */}
            <div className="text-center">
              <h3 className="text-xl font-semibold text-content">
                {profile.displayName || profile.name}
              </h3>
              {profile.displayName && (
                <p className="text-sm text-caption">
                  {profile.name}
                </p>
              )}
            </div>

            {/* Details */}
            <div className="w-full space-y-3">
              <div className="flex items-center text-sm text-secondary">
                <Mail className="h-4 w-4 mr-2 text-caption" />
                <span className="truncate">{profile.email}</span>
              </div>

              <div className="flex items-center text-sm text-secondary">
                <Calendar className="h-4 w-4 mr-2 text-caption" />
                <span>
                  {t('dashboard.profile.joined')} {timeAgo(profile.createdAt, language)}
                </span>
              </div>

              <div className="flex items-center text-sm text-secondary">
                <User className="h-4 w-4 mr-2 text-caption" />
                <span>
                  {t('dashboard.profile.lastLogin')} {timeAgo(profile.lastLogin, language)}
                </span>
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
