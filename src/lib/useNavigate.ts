'use client';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { type Page, pageToHref, scrollTop } from './router';

// Bridge: các page/component cũ gọi onNavigate(page: Page). Ở Next ta chuyển
// thành router.push(href). Giữ nguyên chữ ký để không phải sửa nội dung page.
export function useNavigate() {
  const router = useRouter();
  return useCallback((page: Page) => {
    router.push(pageToHref(page));
    scrollTop();
  }, [router]);
}
