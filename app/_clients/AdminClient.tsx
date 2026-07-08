'use client';
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getAdminRole } from '@/lib/api';
import { AdminLogin } from '@/components/AdminLogin';

// AdminPanel (~193KB) lazy-load để không vào bundle khách vãng lai.
const AdminPanel = lazy(() => import('@/components/AdminPanel').then((m) => ({ default: m.AdminPanel })));

const Spinner = ({ dark }: { dark?: boolean }) => (
  <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-gray-950' : 'bg-gray-50'}`}>
    <div className={`w-8 h-8 border-2 ${dark ? 'border-amber-500' : 'border-red-500'} border-t-transparent rounded-full animate-spin`} />
  </div>
);

export function AdminClient() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [entered, setEntered] = useState(false); // đã bấm login thành công

  useEffect(() => {
    if (user) {
      getAdminRole().then(r => { setIsAdmin(r); setAdminChecked(true); })
        .catch(() => { setIsAdmin(false); setAdminChecked(true); });
    } else {
      setIsAdmin(false); setAdminChecked(true);
    }
  }, [user]);

  if (authLoading) return <Spinner />;
  if (!user || !isAdmin) {
    if (!adminChecked) return <Spinner dark />;
    return <AdminLogin onSuccess={() => setEntered(true)} />;
  }
  // user + isAdmin OK
  void entered;
  return (
    <Suspense fallback={<Spinner dark />}>
      <AdminPanel onLogout={async () => { await supabase.auth.signOut(); }} />
    </Suspense>
  );
}
