'use client';
import Image, { type ImageProps } from 'next/image';
import { useEffect, useState } from 'react';
import { storageUrlToPublicImageUrl } from '../lib/siteUrl';

type SafeImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  src: string | null | undefined;
  fallbackSrc?: string;
  onImageError?: (failedSrc: string) => void;
};

export function normalizeSafeImageSource(src: string | null | undefined): string {
  const raw = src?.trim() || '';
  if (!raw || /^(data|blob|javascript):/i.test(raw)) return '';
  if (raw.startsWith('/')) return raw;
  if (!/^https?:\/\//i.test(raw)) return '';
  // URL Supabase legacy được đưa qua proxy ảnh có service role; URL ngoài giữ nguyên.
  return storageUrlToPublicImageUrl(raw);
}

export function nextSafeImageSource(current: string, fallbackSrc?: string): string {
  const fallback = normalizeSafeImageSource(fallbackSrc);
  return fallback && fallback !== current ? fallback : '';
}

// Ảnh public an toàn: tải thẳng URL nguồn (optimizer đã tắt toàn site) và chỉ thử
// fallback một lần. State được reset khi component được tái dùng với src mới.
export function SafeImage({ src, fallbackSrc, alt, onImageError, ...rest }: SafeImageProps) {
  const primary = normalizeSafeImageSource(src);
  const fallback = normalizeSafeImageSource(fallbackSrc);
  const [current, setCurrent] = useState(primary || fallback);

  useEffect(() => {
    setCurrent(primary || fallback);
  }, [primary, fallback]);

  if (!current) return null;

  return (
    <Image
      {...rest}
      src={current}
      alt={alt}
      unoptimized
      onError={() => {
        onImageError?.(current);
        setCurrent(nextSafeImageSource(current, fallback));
      }}
    />
  );
}
