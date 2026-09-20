'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { type Page } from '../lib/router';
import { useNavigate } from '../lib/useNavigate';
import { useAuth } from '../lib/auth';
import { getAreas, getDistricts, getPropertyTypes } from '../lib/api';
import { SHOW_AUTH_EVENT } from '../lib/authModal';
import { type Area, type District, type PropertyType } from '../lib/supabase';
import { Header, Footer, FloatingButtons } from './Layout';
import { UserAuthModal } from './UserAuthModal';
import { CompareBar } from './CompareBar';

// Shell dùng chung cho mọi trang nội dung (trừ home có shell riêng, và admin).
// Tái tạo phần Header/Footer/FloatingButtons + auth modal của App.tsx cũ.
export function SiteChrome({ currentPage, children, profilePage = false, localityActions = false, localitySubnav }: { currentPage: Page; children: React.ReactNode; profilePage?: boolean; localityActions?: boolean; localitySubnav?: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [authModal, setAuthModal] = useState<{ mode: 'login' | 'register' } | null>(null);
  const [actionsRail, setActionsRail] = useState<HTMLDivElement | null>(null);
  const [mobileActions, setMobileActions] = useState(false);

  useEffect(() => {
    if (!localityActions) return;
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setMobileActions(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [localityActions]);

  useEffect(() => { getAreas().then(setAreas).catch(() => {}); }, []);
  // Footer liệt kê quận/huyện theo tỉnh nên cần cả districts, tải rời để không chặn header.
  useEffect(() => { getDistricts().then(setDistricts).catch(() => {}); }, []);
  useEffect(() => { getPropertyTypes().then(setPropertyTypes).catch(() => {}); }, []);

  // Trang con (vd đăng tin) yêu cầu mở modal đăng nhập qua global event vì modal
  // sống ở shell này, không truyền onShowAuth xuống mọi page.
  useEffect(() => {
    const onShow = (e: Event) => {
      const mode = (e as CustomEvent<{ mode?: 'login' | 'register' }>).detail?.mode ?? 'login';
      setAuthModal({ mode });
    };
    window.addEventListener(SHOW_AUTH_EVENT, onShow);
    return () => window.removeEventListener(SHOW_AUTH_EVENT, onShow);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        currentPage={currentPage}
        onNavigate={navigate}
        user={user}
        areas={areas}
        onShowAuth={(mode) => setAuthModal({ mode })}
        onLogout={async () => { await supabase.auth.signOut(); navigate({ name: 'home' }); }}
      />
      <div className="pt-[var(--cnv-header-height)]">
        {localitySubnav}
        {localityActions && <div ref={setActionsRail} role="group" aria-label="Công cụ hỗ trợ tìm nhà" className="flex min-h-16 flex-wrap items-center justify-end gap-2 border-b border-gray-100 bg-white px-4 py-2 sm:hidden" />}
        {children}
      </div>
      <Footer areas={areas} districts={districts} propertyTypes={propertyTypes} onNavigate={navigate} />
      <FloatingButtons onNavigate={navigate} profilePage={profilePage} localityActionsTarget={localityActions && mobileActions ? actionsRail : null} />
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
