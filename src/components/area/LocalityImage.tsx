import React from 'react';
import { SafeImage } from '@/components/SafeImage';
import { normalizePublicHref, normalizePublicImageUrl } from '@/lib/siteUrl';

export function LocalityImage({ src, alt, className = '', imageClassName = '', priority = false }: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  const imageSrc = normalizePublicHref(normalizePublicImageUrl(src));
  return <div className={`relative isolate overflow-hidden bg-gray-100 ${className}`}>
    <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-gray-400">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></svg>
      <span className="text-[11px] leading-4">Ảnh chưa có sẵn</span>
    </div>
    <SafeImage src={imageSrc} alt={alt} fill priority={priority} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px" className={`z-10 object-cover ${imageClassName}`} />
  </div>;
}
