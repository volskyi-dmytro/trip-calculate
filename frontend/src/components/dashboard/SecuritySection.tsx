import { Shield, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

export function SecuritySection() {
  const { t } = useLanguage();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
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
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
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
        </div>
      </CardContent>
    </Card>
  );
}
