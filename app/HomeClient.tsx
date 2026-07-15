'use client';
import { useState } from 'react';
import { LandingPage } from '@/LandingPage';
import { UserAuthModal } from '@/components/UserAuthModal';
import { useAuth } from '@/lib/auth';
import { useNavigate } from '@/lib/useNavigate';

// Home có shell riêng (Header/Footer nằm trong LandingPage). Wrapper cấp
// onNavigate/onAdmin/user + auth modal, tái tạo nhánh home của App.tsx cũ.
export function HomeClient() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authModal, setAuthModal] = useState<{ mode: 'login' | 'register' } | null>(null);

  return (
    <>
      <LandingPage
        onNavigate={navigate}
        user={user}
        onShowAuth={(mode) => setAuthModal({ mode })}
      />
      {authModal && (
        <UserAuthModal
          mode={authModal.mode}
          onClose={() => setAuthModal(null)}
          onSuccess={() => setAuthModal(null)}
          onSwitchMode={(m) => setAuthModal({ mode: m })}
        />
      )}
    </>
  );
}
