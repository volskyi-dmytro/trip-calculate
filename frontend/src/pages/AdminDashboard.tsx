import { useState } from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/common/Header';
import { SystemOverview } from '../components/admin/SystemOverview';
import { UsersTable } from '../components/admin/UsersTable';
import { AccessRequestsTable } from '../components/admin/AccessRequestsTable';

type TabType = 'overview' | 'users' | 'requests';

export function AdminDashboard() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs = [
    { id: 'overview' as TabType, label: t('admin.tabs.overview') },
    { id: 'users' as TabType, label: t('admin.tabs.users') },
    { id: 'requests' as TabType, label: t('admin.tabs.accessRequests') },
  ];

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-purple-900/20">
        <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-2">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {t('admin.title')}
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {t('admin.subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-4 sm:mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex flex-col sm:flex-row sm:space-x-8 -mb-px" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm sm:text-base transition-colors text-left
                    ${
                      activeTab === tab.id
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'overview' && <SystemOverview />}
          {activeTab === 'users' && <UsersTable />}
          {activeTab === 'requests' && <AccessRequestsTable />}
        </div>
        </div>
      </div>
    </>
  );
}
