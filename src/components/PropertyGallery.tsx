'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Heart, Image as ImageIcon } from 'lucide-react';
import { buildPropertyGallery, buildPropertyImageAlt, getPropertyGalleryMeta } from '../lib/propertyImages';
import type { Property } from '../lib/supabase';
import { SafeImage } from './SafeImage';

const PROPERTY_TYPE_FALLBACK = 'Bất động sản';

type GalleryProperty = Pick<Property, 'id' | 'title' | 'image_url' | 'images' | 'ward' | 'district' | 'city' | 'listing_type' | 'property_types'>;

export function PropertyGallery({
  property,
  href,
  sizes = '(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw',
  topLeft,
  topRight,
  bottomLeft,
  showTotalPriceLabel = false,
  isFavorited = false,
  onToggleFavorite,
  onLinkClick,
  className = '',
}: {
  property: GalleryProperty;
  href: string;
  sizes?: string;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  showTotalPriceLabel?: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  onLinkClick?: () => void;
  className?: string;
}) {
  const gallery = buildPropertyGallery(property.image_url, property.images);
  const { imageCount, extraImageCount } = getPropertyGalleryMeta(property.image_url, property.images);
  const propertyType = property.property_types?.name?.trim() || (property.listing_type === 'cho_thue' ? 'Cho thuê' : PROPERTY_TYPE_FALLBACK);
  const hasMultipleImages = imageCount > 1;
  const visibleImages = gallery.slice(0, 3);

  const renderImage = (src: string, index: number, wrapperClassName: string, overlay?: ReactNode) => (
    <div className={`relative min-h-0 overflow-hidden bg-gray-100 ${wrapperClassName}`}>
      <SafeImage
        src={src}
        alt={buildPropertyImageAlt(property, index)}
        fill
        sizes={sizes}
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {overlay}
    </div>
  );

  return (
    <div data-testid="property-gallery" className={`group relative aspect-[16/10] overflow-hidden bg-gray-100 ${className}`}>
      <Link
        href={href}
        onClick={onLinkClick}
        aria-label={property.title}
        className="absolute inset-0 z-[1]"
      />
      {visibleImages.length === 1 ? (
        renderImage(visibleImages[0], 0, 'h-full w-full')
      ) : visibleImages.length === 2 ? (
        <div className="grid h-full grid-cols-5 gap-1">
          {renderImage(visibleImages[0], 0, 'col-span-3 h-full')}
          {renderImage(visibleImages[1], 1, 'col-span-2 h-full')}
        </div>
      ) : (
        <div className="grid h-full grid-cols-5 gap-1">
          {renderImage(visibleImages[0], 0, 'col-span-3 row-span-2 h-full')}
          {renderImage(visibleImages[1], 1, 'col-span-2 row-span-1 h-full')}
          {renderImage(
            visibleImages[2],
            2,
            'col-span-2 row-span-1 h-full',
            extraImageCount > 0 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-black text-white" aria-hidden="true">
                +{extraImageCount}
              </span>
            ) : undefined,
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
      {topLeft ?? (
        <span className="absolute left-2 top-2 z-[2] rounded-md bg-red-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          {propertyType}
        </span>
      )}
      <div className="absolute right-2 top-2 z-[3] flex items-center gap-1.5">
        {topRight}
        {hasMultipleImages && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-900/70 px-2.5 py-1 text-[10px] font-bold text-white">
            <ImageIcon className="h-3 w-3" />{imageCount} ẢNH
          </span>
        )}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={event => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(); }}
            aria-label={isFavorited ? 'Bỏ lưu tin đăng' : 'Lưu tin đăng'}
            aria-pressed={isFavorited}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-gray-500 shadow-md transition hover:scale-105 hover:text-red-500"
          >
            <Heart className={`h-4 w-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
          </button>
        )}
      </div>
      {bottomLeft}
      {showTotalPriceLabel && (
        <span className="absolute bottom-2 right-2 z-[2] rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          TỔNG GIÁ
        </span>
      )}
    </div>
  );
}
