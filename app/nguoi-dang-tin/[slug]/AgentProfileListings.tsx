'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/SafeImage';
import { buildProductPath } from '@/lib/productPath';
import { formatPropertyPrice } from '@/lib/listingPrice';
import type { ListingType, PublicAgentListing } from '@/lib/supabase';

type CategoryKey = 'all' | `listing:${ListingType}` | `property:${string}`;

type Props = {
  listings: PublicAgentListing[];
};

function listingTypeLabel(type: ListingType): string {
  return type === 'cho_thue' ? 'Cho thuê' : 'Mua bán';
}

function listingLocation(listing: PublicAgentListing): string {
  return [listing.district, listing.city].filter(Boolean).join(', ');
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function categoryKeyForProperty(listing: PublicAgentListing): CategoryKey {
  return `property:${listing.property_type_slug || listing.property_type_name || 'uncategorized'}`;
}

function AgentListingRow({ listing }: { listing: PublicAgentListing }) {
  const href = buildProductPath({
    id: listing.id,
    slug: listing.slug,
    public_code: listing.public_code,
    listing_type: listing.listing_type,
    district: listing.district,
    areas: { slug: listing.area_slug ?? undefined },
  });
  const image = listing.image_url || listing.images?.[0] || null;
  const location = listingLocation(listing);

  return (
    <Link
      href={href}
      className="group min-w-0 max-w-full grid gap-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-red-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:grid-cols-[190px_minmax(0,1fr)] sm:p-4"
    >
      <div className="relative h-44 overflow-hidden rounded-xl bg-gray-100 sm:h-36">
        {image ? (
          <SafeImage
            src={image}
            alt={listing.title}
            width={640}
            height={384}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            fallbackSrc="/placeholder-property.svg"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-gray-400">Chưa có ảnh</div>
        )}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${listing.listing_type === 'cho_thue' ? 'bg-blue-600' : 'bg-red-600'}`}>
          {listingTypeLabel(listing.listing_type)}
        </span>
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-3 py-1">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <span>{listing.property_type_name || 'Chưa phân loại'}</span>
            <span className="text-gray-300">•</span>
            <span>Đăng {dateLabel(listing.created_at)}</span>
          </div>
          <h3 className="line-clamp-2 text-base font-black leading-6 text-gray-900 group-hover:text-red-600 sm:text-lg">{listing.title}</h3>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0 space-y-1 text-gray-500">
            <p className="truncate">{location || 'Đang cập nhật vị trí'}</p>
            {listing.area_sqm ? <p>{listing.area_sqm} m²</p> : null}
            {listing.legal_status ? <p className="truncate">{listing.legal_status}</p> : null}
          </div>
          <p className="text-lg font-black text-red-600 sm:text-right">{formatPropertyPrice(listing)}</p>
        </div>
      </div>
    </Link>
  );
}

export function AgentProfileListings({ listings }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const categories = useMemo(() => {
    const result: { key: CategoryKey; label: string; count: number }[] = [
      { key: 'all', label: 'Tất cả tin đăng', count: listings.length },
    ];
    const listingTypes = new Map<ListingType, number>();
    const propertyTypes = new Map<string, { label: string; count: number }>();

    for (const listing of listings) {
      listingTypes.set(listing.listing_type, (listingTypes.get(listing.listing_type) || 0) + 1);
      const key = categoryKeyForProperty(listing);
      const current = propertyTypes.get(key);
      propertyTypes.set(key, {
        label: listing.property_type_name || 'Chưa phân loại',
        count: (current?.count || 0) + 1,
      });
    }

    for (const type of ['mua_ban', 'cho_thue'] as ListingType[]) {
      const count = listingTypes.get(type);
      if (count) result.push({ key: `listing:${type}`, label: listingTypeLabel(type), count });
    }
    [...propertyTypes.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label, 'vi'))
      .forEach(([key, value]) => result.push({ key: key as CategoryKey, ...value }));
    return result;
  }, [listings]);

  const filteredListings = useMemo(() => {
    if (selectedCategory === 'all') return listings;
    if (selectedCategory.startsWith('listing:')) {
      return listings.filter(listing => `listing:${listing.listing_type}` === selectedCategory);
    }
    return listings.filter(listing => categoryKeyForProperty(listing) === selectedCategory);
  }, [listings, selectedCategory]);

  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-14 text-center text-sm text-gray-500">
        Hồ sơ chưa có tin đăng đang hiển thị.
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
      <aside className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-24">
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Khám phá tin đăng</p>
          <h3 className="mt-1 text-lg font-black text-gray-900">Danh mục</h3>
        </div>
        <nav aria-label="Lọc tin đăng theo danh mục" className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
          {categories.map(category => {
            const active = selectedCategory === category.key;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setSelectedCategory(category.key)}
                aria-pressed={active}
                className={`flex min-w-max items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition lg:w-full ${active ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <span>{category.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white text-red-700' : 'bg-gray-100 text-gray-500'}`}>{category.count}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="w-full min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Tin đăng</p>
            <h2 className="mt-1 text-2xl font-black text-gray-900">Bất động sản đang hiển thị</h2>
          </div>
          <span className="text-sm font-semibold text-gray-500">{filteredListings.length} / {listings.length} tin</span>
        </div>
        {filteredListings.length > 0 ? (
          filteredListings.map(listing => <AgentListingRow key={listing.id} listing={listing} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center text-sm text-gray-500">
            Không có tin đăng trong danh mục này.
          </div>
        )}
      </div>
    </div>
  );
}
