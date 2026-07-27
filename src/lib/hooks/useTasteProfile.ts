'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRemoteTasteSignals, listSavedSearches } from '../api';
import { getSignals } from '../tasteStore';
import { savedSearchesToSignals } from '../savedSearch';
import { inferTaste, type Signal, type TasteProfile } from '../taste';
import { useAuth } from '../auth';

export function useTasteProfile(): { profile: TasteProfile; ready: boolean } {
  const { user } = useAuth();
  const [local, setLocal] = useState<Signal[]>([]);
  const [ready, setReady] = useState(false);

  // Đọc localStorage SAU mount (tránh lệch SSR/hydration).
  useEffect(() => {
    setLocal(getSignals());
    setReady(true);
  }, []);

  const { data: remote = [] } = useQuery({
    queryKey: ['remoteTasteSignals', user?.id ?? null],
    queryFn: getRemoteTasteSignals,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Nhu cầu tường minh khách tự lưu (chỉ khi đăng nhập) → nạp làm tín hiệu 'search'.
  const { data: saved = [] } = useQuery({
    queryKey: ['savedSearchesForTaste', user?.id ?? null],
    queryFn: listSavedSearches,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const now = Date.now();
  const savedSignals = savedSearchesToSignals(saved, now);
  const profile = inferTaste([...local, ...remote, ...savedSignals], now);
  return { profile, ready };
}
