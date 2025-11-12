import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { MapPin, Edit2, Trash2, Navigation, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { RouteListItem } from '../../services/dashboardService';
import { routeService } from '../../services/routeService';
import { useLanguage } from '../../contexts/LanguageContext';

interface RoutesListProps {
  routes: RouteListItem[];
  onRouteDeleted: () => void;
}

type SortOption = 'newest' | 'oldest' | 'distance';

export function RoutesList({ routes, onRouteDeleted }: RoutesListProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<RouteListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sortedRoutes = [...routes].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'distance':
        return b.totalDistance - a.totalDistance;
      default:
        return 0;
    }
  });

  const handleEdit = (routeId: number) => {
    navigate(`/route-planner?routeId=${routeId}`);
  };

  const confirmDelete = (route: RouteListItem) => {
    setRouteToDelete(route);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!routeToDelete) return;

    setDeleting(true);
    try {
      await routeService.deleteRoute(routeToDelete.id);
      toast.success(t('dashboard.routes.deleteSuccess'));
      setDeleteDialogOpen(false);
      onRouteDeleted();
    } catch (error) {
      console.error('Failed to delete route:', error);
      toast.error(t('dashboard.routes.deleteError'));
    } finally {
      setDeleting(false);
      setRouteToDelete(null);
    }
  };

  if (routes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('dashboard.routes.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Navigation className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('dashboard.routes.empty')}
            </p>
            <Button onClick={() => navigate('/route-planner')}>
              {t('dashboard.routes.createFirst')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-xl">{t('dashboard.routes.title')}</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">
                {t('dashboard.routes.sortBy')}:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="newest">{t('dashboard.routes.sortNewest')}</option>
                <option value="oldest">{t('dashboard.routes.sortOldest')}</option>
                <option value="distance">{t('dashboard.routes.sortDistance')}</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedRoutes.map((route) => (
              <div
                key={route.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    {route.name}
                  </h4>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center">
                      <MapPin className="h-3.5 w-3.5 mr-1" />
                      {route.waypointCount} {t('dashboard.routes.waypoints')}
                    </span>
                    <span>
                      {route.totalDistance.toFixed(1)} km
                    </span>
                    <span>
                      {route.currency}{route.totalCost.toFixed(2)}
                    </span>
                    <span className="text-xs">
                      {formatDistanceToNow(new Date(route.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 sm:mt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(route.id)}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    {t('dashboard.routes.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => confirmDelete(route)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.routes.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('dashboard.routes.deleteConfirmMessage')} <strong>{routeToDelete?.name}</strong>?
              <br />
              {t('dashboard.routes.deleteConfirmWarning')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {t('dashboard.routes.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dashboard.routes.deleting')}
                </>
              ) : (
                t('dashboard.routes.delete')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
