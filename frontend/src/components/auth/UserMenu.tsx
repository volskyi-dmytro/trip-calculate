import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChevronDown, User, LayoutDashboard, Shield, LogOut, Map } from 'lucide-react';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

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
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const menuItems = [
    {
      icon: LayoutDashboard,
      label: t('header.nav.dashboard'),
      onClick: () => {
        navigate('/dashboard');
        setIsOpen(false);
      },
      show: true,
    },
    {
      icon: Map,
      label: t('userMenu.myRoutes'),
      onClick: () => {
        navigate('/dashboard');
        setIsOpen(false);
      },
      show: true,
    },
    {
      icon: Shield,
      label: t('header.nav.admin'),
      onClick: () => {
        navigate('/admin');
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
        className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/95 dark:bg-gray-800/95 shadow-md hover:shadow-lg transition-all border border-gray-300 dark:border-gray-600"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border-2 border-blue-500 flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        )}
        <span className="hidden sm:inline text-sm font-medium text-gray-900 dark:text-white max-w-[100px] truncate">
          {user.name}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
          </div>

          {/* Logout Button */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-1">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
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
