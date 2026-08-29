'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRemoteTasteSignals } from '../api';
import { getSignals, TASTE_SIGNALS_CHANGED_EVENT, TASTE_SIGNALS_STORAGE_KEY } from '../tasteStore';
import { inferTaste, mergeSignalSources, type Signal, type TasteProfile } from '../taste';
import { useAuth } from '../auth';

const EMPTY_SIGNALS: Signal[] = [];

export function useTasteProfile(): { profile: TasteProfile; ready: boolean } {
  const { user } = useAuth();
  const [local, setLocal] = useState<Signal[]>([]);
  const [ready, setReady] = useState(false);
  const [profileNow, setProfileNow] = useState(() => Date.now());

  // Đọc localStorage SAU mount và cập nhật khi capture/reconcile thay đổi signal.
  useEffect(() => {
    const refresh = () => setLocal(getSignals());
    const onStorage = (event: StorageEvent) => {
      if (event.key === TASTE_SIGNALS_STORAGE_KEY) refresh();
    };
    refresh();
    setReady(true);
    window.addEventListener(TASTE_SIGNALS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(TASTE_SIGNALS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setProfileNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const remoteQuery = useQuery({
    queryKey: ['remoteTasteSignals', user?.id ?? null],
    queryFn: getRemoteTasteSignals,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const remote = remoteQuery.data ?? EMPTY_SIGNALS;

  const signals = useMemo(() => mergeSignalSources(local, remote), [local, remote]);
  // Ý định trong phiên: tín hiệu trong ~1 giờ qua nặng gấp 3 → hành vi "ngay lúc này"
  // nổi lên trên hồ sơ dài hạn (nửa-đời 14 ngày bắt kịp phiên quá chậm).
  const profile = useMemo(() => inferTaste(signals, profileNow, {
    sessionWindowMs: 60 * 60 * 1000,
    sessionBoost: 3,
  }), [profileNow, signals]);
  return { profile, ready };
}
