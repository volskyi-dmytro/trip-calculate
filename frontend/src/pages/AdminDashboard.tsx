import { useState } from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-purple-900/20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('admin.title')}
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {t('admin.subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm transition-colors
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
  );
}
