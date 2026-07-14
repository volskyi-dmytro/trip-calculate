import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, XCircle, Loader2, Clock, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

import { adminService, type AccessRequest } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';

export function AccessRequestsTable() {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');


  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [filter, requests]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await adminService.getAllAccessRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to fetch access requests:', error);
      toast.error(t('admin.requests.error.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const filterRequests = () => {
    if (filter === 'all') {
      setFilteredRequests(requests);
    } else {
      const filtered = requests.filter(
        (req) => req.status === filter.toUpperCase()
      );
      setFilteredRequests(filtered);
    }
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="h-3 w-3 mr-1" />
            {t('admin.requests.status.pending')}
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            {t('admin.requests.status.approved')}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3 mr-1" />
            {t('admin.requests.status.rejected')}
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-xl">{t('admin.requests.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="px-3 py-1.5 text-sm border border-gray-300/60 dark:border-gray-600/60 rounded-md glass-inset text-gray-900 dark:text-white"
            >
              <option value="all">{t('admin.requests.filter.all')}</option>
              <option value="pending">{t('admin.requests.filter.pending')}</option>
              <option value="approved">{t('admin.requests.filter.approved')}</option>
              <option value="rejected">{t('admin.requests.filter.rejected')}</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">
              {t('admin.requests.empty')}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('admin.requests.table.user')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('admin.requests.table.feature')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('admin.requests.table.status')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('admin.requests.table.requestedAt')}
                    </th>

                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {request.userName}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {request.userEmail}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-900 dark:text-white">
                          {request.featureName.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(request.status)}</td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDistanceToNow(new Date(request.requestedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 rounded-lg border border-gray-200/60 dark:border-gray-700/60 glass-inset"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {request.userName}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {request.userEmail}
                      </p>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('admin.requests.table.feature')}:
                      </span>
                      <span>{request.featureName.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('admin.requests.table.requestedAt')}:
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(request.requestedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
