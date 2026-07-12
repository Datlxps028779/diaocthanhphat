'use client';
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Token trong localStorage có thể còn sót từ project/signing-key cũ.
      // getSession() KHÔNG verify chữ ký — nếu để nguyên, client sẽ đính Bearer
      // hỏng vào mọi request và bị 401 (PGRST301) kể cả khi đọc dữ liệu public.
      // Verify bằng getUser() (gọi server); token hỏng thì signOut để về apikey-only.
      if (session) {
        const { error } = await supabase.auth.getUser();
        if (error) {
          await supabase.auth.signOut();
          setState({ user: null, session: null, loading: false });
          return;
        }
      }
      setState({ user: session?.user ?? null, session, loading: false });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Link đặt lại mật khẩu: client tự nuốt hash (#access_token=...&type=recovery) và
      // phát PASSWORD_RECOVERY. Dù link rơi vào bất kỳ trang nào (kể cả "/"), điều hướng
      // về /dat-lai-mat-khau để hiện form — tránh việc bị đăng nhập thẳng vào trang chủ.
      if (event === 'PASSWORD_RECOVERY' && typeof window !== 'undefined'
          && window.location.pathname !== '/dat-lai-mat-khau') {
        window.location.replace('/dat-lai-mat-khau');
        return;
      }
      setState({ user: session?.user ?? null, session, loading: false });
    });
    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
