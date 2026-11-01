import { useAuthStore } from '@/store/authStore';

type Role = 'admin' | 'factory' | 'manager' | 'warehouse' | 'accountant' | 'warehouse_manager';

const PERMISSIONS = {
  canEditProducts: ['admin', 'factory', 'warehouse_manager', 'warehouse', 'manager'] as Role[],
  canDeleteProducts: ['admin', 'factory', 'warehouse_manager', 'warehouse', 'manager'] as Role[],
  canViewPayments: ['admin', 'accountant', 'manager', 'warehouse_manager', 'warehouse'] as Role[],
  canCreateReceipts: ['admin', 'manager', 'warehouse', 'warehouse_manager'] as Role[],
  canViewWarehouses: ['admin', 'warehouse_manager', 'warehouse', 'manager'] as Role[],
} as const;

export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role?.toLowerCase() ?? '') as Role;
  const isSuperuser = useAuthStore((s) => s.user?.isSuperuser ?? false);

  return {
    can: (permission: keyof typeof PERMISSIONS) =>
      isSuperuser || PERMISSIONS[permission].includes(role),
    role,
    isSuperuser,
  };
}
