'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';
import { CmsProvider } from '@/lib/cms';

// QueryClient tạo trong useState để mỗi client có instance riêng, an toàn khi SSR
// (không chia sẻ cache giữa các request trên server). Cấu hình đồng bộ queryClient.ts.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CmsProvider>{children}</CmsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
