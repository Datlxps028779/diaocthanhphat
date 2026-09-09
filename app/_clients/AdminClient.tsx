'use client';
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getPanelRole, getMyStaffPermissions } from '@/lib/api';
import type { StaffPermission } from '@/lib/staffPermissions';
import { canAccessPanel, type Role } from '@/lib/adminAccess';
import { AdminLogin } from '@/components/AdminLogin';

// AdminPanel (~193KB) lazy-load để không vào bundle khách vãng lai.
const AdminPanel = lazy(() => import('@/components/AdminPanel').then((m) => ({ default: m.AdminPanel })));

const Spinner = ({ dark }: { dark?: boolean }) => (
  <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-gray-950' : 'bg-gray-50'}`}>
    <div className={`w-8 h-8 border-2 ${dark ? 'border-amber-500' : 'border-red-500'} border-t-transparent rounded-full animate-spin`} />
  </div>
);

export function AdminClient({ initialTab, forceStaff = false, forceOwner = false }: { initialTab?: string; forceStaff?: boolean; forceOwner?: boolean } = {}) {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [permissions, setPermissions] = useState<StaffPermission[]>([]);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [entered, setEntered] = useState(false); // đã bấm login thành công
  // Supabase tạo object User mới khi refresh token. Chỉ user ID mới là identity
  // ổn định; dùng nó để không tháo AdminPanel và làm mất modal/draft đang làm dở.
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setRole(null);
      setRoleChecked(true);
      setPermissions([]);
      setPermissionsChecked(true);
      return;
    }

    setRoleChecked(false);
    setPermissionsChecked(false);
    getPanelRole().then(async r => {
      setRole(r);
      setRoleChecked(true);
      if (r !== 'staff') {
        setPermissions([]);
        setPermissionsChecked(true);
        return;
      }
      try {
        setPermissions(await getMyStaffPermissions());
      } catch {
        setPermissions([]);
      } finally {
        setPermissionsChecked(true);
      }
    }).catch(() => {
      setRole(null);
      setRoleChecked(true);
      setPermissions([]);
      setPermissionsChecked(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!authLoading && !user && forceOwner) window.location.replace('/quyen-chu-he-thong');
    if (!authLoading && !user && forceStaff) window.location.replace('/');
  }, [authLoading, forceOwner, forceStaff, user]);

  const panelRole: Role | null = forceOwner ? 'admin' : forceStaff ? 'staff' : role;

  if (authLoading) return <Spinner />;
  if (!user || !roleChecked || !permissionsChecked) return <Spinner dark />;
  if (!canAccessPanel(panelRole)) {
    if (forceOwner || forceStaff) return <Spinner dark />;
    return <AdminLogin onSuccess={() => setEntered(true)} />;
  }
  // user + quyền vào panel (admin|staff) OK
  void entered;
  return (
    <Suspense fallback={<Spinner dark />}>
      <AdminPanel role={panelRole!} permissions={permissions} initialTab={initialTab} basePath={forceStaff ? '/noi-bo' : '/quantrihethong'} onLogout={async () => { await supabase.auth.signOut(); }} />
    </Suspense>
  );
}
