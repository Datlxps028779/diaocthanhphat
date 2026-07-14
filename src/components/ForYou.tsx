'use client';
import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MapPin, Sparkles } from 'lucide-react';
import { getAllProperties } from '../lib/api';
import { buildPropertyPath } from '../lib/api/properties';
import { useAreas, usePropertyTypes } from '../lib/hooks/useTaxonomy';
import { getSignals } from '../lib/tasteStore';
import { inferTaste, rankRecommendations, hasEnoughSignal, topKey } from '../lib/taste';
import { getRecentlyViewed } from '../lib/recentlyViewed';

// "Gợi ý dành cho bạn" — tự học từ hành vi (tìm kiếm + xem), không cần đăng nhập,
// không cần khách thao tác. Ẩn hoàn toàn khi chưa đủ tín hiệu (khách mới).
export function ForYou({ excludeId, title = 'Gợi ý dành cho bạn' }: { excludeId?: string; title?: string }) {
  const [profile, setProfile] = useState(() => inferTaste([], Date.now()));
  const [ready, setReady] = useState(false);

  // Đọc localStorage + suy sở thích SAU mount (tránh lệch SSR/hydration).
  useEffect(() => {
    setProfile(inferTaste(getSignals(), Date.now()));
    setReady(true);
  }, []);

  const enough = ready && hasEnoughSignal(profile);
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();

  // Pool ứng viên: BĐS active mới nhất. Chỉ fetch khi đã đủ tín hiệu để gợi ý.
  const { data: pool } = useQuery({
    queryKey: ['forYouPool'],
    queryFn: () => getAllProperties({ sort: 'newest', limit: 60 }),
    enabled: enough,
  });

  const recs = useMemo(() => {
    if (!pool?.data) return [];
    const excludeIds = [
      ...(excludeId ? [excludeId] : []),
      ...getRecentlyViewed().map(p => p.id),   // đừng gợi lại tin vừa xem
    ];
    return rankRecommendations(pool.data, profile, { limit: 4, excludeIds });
  }, [pool, profile, excludeId]);

  if (!enough || recs.length === 0) return null;

  // Nhãn "vì bạn quan tâm X" từ khu vực/loại có trọng số cao nhất.
  const topArea = topKey(profile.areaWeights);
  const topType = topKey(profile.typeWeights);
  const areaName = topArea ? areas.find(a => a.id === topArea)?.name : undefined;
  const typeName = topType ? types.find(t => t.id === topType)?.name : undefined;
  const reason = [typeName, areaName].filter(Boolean).join(' · ');

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-red-500" />
        <h2 className="font-black text-gray-900 text-xl">{title}</h2>
        {reason && <span className="text-xs text-gray-400 font-medium">vì bạn quan tâm {reason}</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {recs.map(p => (
          <Link key={p.id} href={buildPropertyPath(p)}
            className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-300 group flex flex-col">
            <div className="relative h-40 overflow-hidden">
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
