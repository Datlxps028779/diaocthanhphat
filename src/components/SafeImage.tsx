'use client';
import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

// Host ảnh đã khai báo trong next.config.mjs remotePatterns. next/image chỉ tối ưu
// được các host này; host lạ (ảnh user dán từ nguồn bất kỳ) nếu để optimizer xử lý
// sẽ ném lỗi runtime "hostname not configured". Vì vậy host ngoài danh sách → render
// unoptimized (bỏ qua optimizer, không bao giờ crash) nhưng vẫn giữ lazy-load + layout.
const OPTIMIZED_HOST_SUFFIXES = ['images.pexels.com', 'images.unsplash.com', 'chonhaviet.com', '.supabase.co'];

function isOptimizableHost(src: string): boolean {
  if (src.startsWith('/')) return true; // ảnh nội bộ / rewrite /hinh-anh
  try {
    const host = new URL(src).hostname;
    return OPTIMIZED_HOST_SUFFIXES.some(suffix =>
      suffix.startsWith('.') ? host.endsWith(suffix) : host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

type SafeImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  src: string | null | undefined;
  fallbackSrc?: string;
};

// Ảnh public an toàn: next/image cho host đã cấu hình, unoptimized cho host lạ,
// và tự chuyển sang fallbackSrc khi ảnh gốc lỗi để không hiện ô vỡ.
export function SafeImage({ src, fallbackSrc, alt, ...rest }: SafeImageProps) {
  const initial = (src && src.trim()) || fallbackSrc || '';
  const [current, setCurrent] = useState(initial);
  if (!current) return null;
  return (
    <Image
      {...rest}
      src={current}
      alt={alt}
      unoptimized={!isOptimizableHost(current)}
      onError={() => { if (fallbackSrc && current !== fallbackSrc) setCurrent(fallbackSrc); }}
    />
  );
}
