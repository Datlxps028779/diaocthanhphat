'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { getRecentlyViewed, type RecentProperty } from '../lib/recentlyViewed';
import { buildPropertyPath } from '../lib/api/properties';

// Dải "Đã xem gần đây" — đọc localStorage sau khi mount (tránh lệch SSR/hydration).
// excludeId: bỏ chính BĐS đang xem khỏi danh sách.
export function RecentlyViewed({ excludeId, title = 'Đã xem gần đây' }: { excludeId?: string; title?: string }) {
  const [items, setItems] = useState<RecentProperty[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed(excludeId));
  }, [excludeId]);

  if (items.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="font-black text-gray-900 text-xl mb-4">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(p => (
          <Link key={p.id} href={buildPropertyPath(p)}
            className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-300 group flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
              <img src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'}
                alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              {p.listing_type === 'cho_thue' && (
                <span className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Cho thuê</span>
              )}
            </div>
            <div className="p-3 flex flex-col flex-1">
              <h3 className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2 group-hover:text-red-600 transition-colors mb-1">{p.title}</h3>
              <p className="text-red-600 font-black text-sm">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
              <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span className="truncate">{p.district ? `${p.district}, ` : ''}{p.city}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
