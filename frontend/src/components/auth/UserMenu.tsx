import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChevronDown, User, LayoutDashboard, Shield, LogOut, Map as MapIcon } from 'lucide-react';
import { avatarProxyUrl } from '../../utils/avatar';
import { withLocalePrefix } from '../../utils/locale';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate(withLocalePrefix('/', language));
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const menuItems = [
    {
      icon: MapIcon,
      label: t('header.nav.planTrip'),
      onClick: () => {
        navigate(withLocalePrefix('/route-planner', language));
        setIsOpen(false);
      },
      show: true,
    },
    {
      icon: LayoutDashboard,
      label: t('header.nav.myTrips'),
      onClick: () => {
        navigate(withLocalePrefix('/dashboard', language));
        setIsOpen(false);
      },
      show: true,
    },
    {
      icon: Shield,
      label: t('header.nav.admin'),
      onClick: () => {
        navigate(withLocalePrefix('/admin', language));
        setIsOpen(false);
      },
      show: user?.isAdmin || false,
    },
  ];

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={user.name}
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 sm:gap-2 min-h-11 px-2 sm:px-3 rounded-lg glass-panel hover:shadow transition-shadow"
      >
        {user.picture && !avatarFailed ? (
          <img
            src={avatarProxyUrl(user.picture)!}
            alt={user.name}
            onError={() => setAvatarFailed(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-edge flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
          </div>
        )}
        <span className="hidden sm:inline text-sm font-medium text-content max-w-[100px] truncate">
          {user.name}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-secondary transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 glass-modal rounded-lg py-2 z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-edge">
            <p className="text-sm font-medium text-content truncate">
              {user.name}
            </p>
            <p className="text-xs text-caption truncate">
              {user.email}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {menuItems
              .filter((item) => item.show)
              .map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={index}
                    onClick={item.onClick}
                    className="w-full px-4 py-2 text-left text-sm text-secondary hover:bg-inset flex items-center gap-3 transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
          </div>

          {/* Logout Button */}
          <div className="border-t border-edge pt-1">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger-soft flex items-center gap-3 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('header.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
