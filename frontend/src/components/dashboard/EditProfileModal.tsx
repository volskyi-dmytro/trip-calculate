import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { dashboardService, type UserProfile } from '../../services/dashboardService';
import { useLanguage } from '../../contexts/LanguageContext';

interface EditProfileModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditProfileModal({
  profile,
  isOpen,
  onClose,
  onSuccess,
}: EditProfileModalProps) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: profile.displayName || '',
    preferredLanguage: profile.preferredLanguage || 'en',
    defaultFuelConsumption: profile.defaultFuelConsumption || 8.0,
    emailNotificationsEnabled: profile.emailNotificationsEnabled,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (formData.displayName && formData.displayName.length > 50) {
      newErrors.displayName = t('dashboard.editProfile.error.displayNameTooLong');
    }

    if (formData.defaultFuelConsumption <= 0) {
      newErrors.defaultFuelConsumption = t('dashboard.editProfile.error.fuelConsumptionInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await dashboardService.updateProfile({
        displayName: formData.displayName || undefined,
        preferredLanguage: formData.preferredLanguage,
        defaultFuelConsumption: formData.defaultFuelConsumption,
        emailNotificationsEnabled: formData.emailNotificationsEnabled,
      });
      toast.success(t('dashboard.editProfile.success'));
      onSuccess();
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error(t('dashboard.editProfile.error.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('dashboard.editProfile.title')}</DialogTitle>
            <DialogDescription>
              {t('dashboard.editProfile.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName">
                {t('dashboard.editProfile.displayName')}
              </Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({ ...formData, displayName: e.target.value })
                }
                placeholder={profile.name}
                maxLength={50}
              />
              {errors.displayName && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errors.displayName}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('dashboard.editProfile.displayNameHint')}
              </p>
            </div>

            {/* Preferred Language */}
            <div className="space-y-2">
              <Label htmlFor="language">
                {t('dashboard.editProfile.preferredLanguage')}
              </Label>
              <select
                id="language"
                value={formData.preferredLanguage}
                onChange={(e) =>
                  setFormData({ ...formData, preferredLanguage: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="en">{t('dashboard.editProfile.languageEnglish')}</option>
                <option value="uk">{t('dashboard.editProfile.languageUkrainian')}</option>
              </select>
            </div>

            {/* Default Fuel Consumption */}
            <div className="space-y-2">
              <Label htmlFor="fuelConsumption">
                {t('dashboard.editProfile.fuelConsumption')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fuelConsumption"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={formData.defaultFuelConsumption}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultFuelConsumption: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('dashboard.editProfile.fuelConsumptionUnit')}
                </span>
              </div>
              {errors.defaultFuelConsumption && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errors.defaultFuelConsumption}
                </p>
              )}
            </div>

            {/* Email Notifications */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="emailNotifications"
                checked={formData.emailNotificationsEnabled}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emailNotificationsEnabled: e.target.checked,
                  })
                }
                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <Label htmlFor="emailNotifications" className="cursor-pointer">
                {t('dashboard.editProfile.emailNotifications')}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              {t('dashboard.editProfile.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dashboard.editProfile.saving')}
                </>
              ) : (
                t('dashboard.editProfile.save')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
