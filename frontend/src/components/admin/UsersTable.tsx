import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Search,
  MoreVertical,
  Shield,
  ShieldOff,
  CheckCircle,
  XCircle,
  Trash2,
  Loader2,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { adminService, type UserManagement } from '../../services/adminService';
import { useLanguage } from '../../contexts/LanguageContext';
import { UserDetailsModal } from './UserDetailsModal';

export function UsersTable() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserManagement[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserManagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserManagement | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserManagement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await adminService.getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error(t('admin.users.error.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    if (!searchQuery) {
      setFilteredUsers(users);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query)
    );
    setFilteredUsers(filtered);
  };

  const handleGrantAccess = async (user: UserManagement) => {
    try {
      await adminService.grantAccess(user.id);
      toast.success(t('admin.users.action.grantSuccess'));
      fetchUsers();
    } catch (error) {
      console.error('Failed to grant access:', error);
      toast.error(t('admin.users.action.grantError'));
    }
  };

  const handleRevokeAccess = async (user: UserManagement) => {
    try {
      await adminService.revokeAccess(user.id);
      toast.success(t('admin.users.action.revokeSuccess'));
      fetchUsers();
    } catch (error) {
      console.error('Failed to revoke access:', error);
      toast.error(t('admin.users.action.revokeError'));
    }
  };

  const handleToggleRole = async (user: UserManagement) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      await adminService.updateUserRole(user.id, { role: newRole });
      toast.success(t('admin.users.action.roleChangeSuccess'));
      fetchUsers();
    } catch (error) {
      console.error('Failed to change role:', error);
      toast.error(t('admin.users.action.roleChangeError'));
    }
  };

  const confirmDelete = (user: UserManagement) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    try {
      await adminService.deleteUser(userToDelete.id);
      toast.success(t('admin.users.action.deleteSuccess'));
      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error(t('admin.users.action.deleteError'));
    } finally {
      setDeleting(false);
      setUserToDelete(null);
    }
  };

  const openDetails = (user: UserManagement) => {
    setSelectedUser(user);
    setDetailsModalOpen(true);
    setActionMenuOpen(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-xl">{t('admin.users.title')}</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder={t('admin.users.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full sm:w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('admin.users.table.user')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('admin.users.table.role')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('admin.users.table.access')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('admin.users.table.routes')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('admin.users.table.lastLogin')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('admin.users.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="ml-3">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {user.displayName || user.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {user.role === 'ADMIN' && <Shield className="h-3 w-3 mr-1" />}
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {user.routePlannerAccess ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('admin.users.table.granted')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                          <XCircle className="h-3 w-3 mr-1" />
                          {t('admin.users.table.denied')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {user.routeCount}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)
                          }
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {actionMenuOpen === user.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                            <button
                              onClick={() => openDetails(user)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {t('admin.users.action.viewDetails')}
                            </button>
                            <button
                              onClick={() => {
                                user.routePlannerAccess
                                  ? handleRevokeAccess(user)
                                  : handleGrantAccess(user);
                                setActionMenuOpen(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              {user.routePlannerAccess ? (
                                <>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  {t('admin.users.action.revokeAccess')}
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  {t('admin.users.action.grantAccess')}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                handleToggleRole(user);
                                setActionMenuOpen(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              {user.role === 'ADMIN' ? (
                                <>
                                  <ShieldOff className="h-4 w-4 mr-2" />
                                  {t('admin.users.action.demoteToUser')}
                                </>
                              ) : (
                                <>
                                  <Shield className="h-4 w-4 mr-2" />
                                  {t('admin.users.action.promoteToAdmin')}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                confirmDelete(user);
                                setActionMenuOpen(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('admin.users.action.deleteUser')}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {user.displayName || user.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      user.role === 'ADMIN'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('admin.users.table.access')}:
                    </span>
                    {user.routePlannerAccess ? (
                      <span className="text-green-600 dark:text-green-400">
                        {t('admin.users.table.granted')}
                      </span>
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('admin.users.table.denied')}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('admin.users.table.routes')}:
                    </span>
                    <span>{user.routeCount}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => openDetails(user)}>
                    {t('admin.users.action.viewDetails')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => confirmDelete(user)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">{t('admin.users.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400">
              {t('admin.users.delete.title')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.users.delete.message')} <strong>{userToDelete?.name}</strong>?
              <br />
              <br />
              {t('admin.users.delete.warning')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {t('admin.users.delete.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('admin.users.delete.deleting')}
                </>
              ) : (
                t('admin.users.delete.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          isOpen={detailsModalOpen}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedUser(null);
          }}
          onUserUpdated={fetchUsers}
        />
      )}
    </>
  );
}
