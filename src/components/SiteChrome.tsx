'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { type Page } from '../lib/router';
import { useNavigate } from '../lib/useNavigate';
import { useAuth } from '../lib/auth';
import { getAreas } from '../lib/api';
import { type Area } from '../lib/supabase';
import { Header, Footer, FloatingButtons } from './Layout';
import { UserAuthModal } from './UserAuthModal';
import { CompareBar } from './CompareBar';

// Shell dùng chung cho mọi trang nội dung (trừ home có shell riêng, và admin).
// Tái tạo phần Header/Footer/FloatingButtons + auth modal của App.tsx cũ.
export function SiteChrome({ currentPage, children }: { currentPage: Page; children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [authModal, setAuthModal] = useState<{ mode: 'login' | 'register' } | null>(null);

  useEffect(() => { getAreas().then(setAreas).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        currentPage={currentPage}
        onNavigate={navigate}
        user={user}
        onShowAuth={(mode) => setAuthModal({ mode })}
        onLogout={async () => { await supabase.auth.signOut(); navigate({ name: 'home' }); }}
      />
      {children}
      <Footer areas={areas} onNavigate={navigate} />
      <FloatingButtons />
      <CompareBar />
      {authModal && (
        <UserAuthModal
          mode={authModal.mode}
          onClose={() => setAuthModal(null)}
          onSuccess={() => setAuthModal(null)}
          onSwitchMode={(m) => setAuthModal({ mode: m })}
        />
      )}
    </div>
  );
}
