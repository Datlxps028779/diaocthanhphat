'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRemoteTasteSignals } from '../api';
import { getSignals } from '../tasteStore';
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

  const profile = inferTaste([...local, ...remote], Date.now());
  return { profile, ready };
}
