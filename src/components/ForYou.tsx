'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MapPin, Sparkles } from 'lucide-react';
import { getAllProperties } from '../lib/api';
import { buildPropertyPath } from '../lib/api/properties';
import { SafeImage } from './SafeImage';
import { FALLBACK_PROPERTY_IMAGE } from '../lib/propertyImages';
import { useAreas, usePropertyTypes } from '../lib/hooks/useTaxonomy';
import { useTasteProfile } from '../lib/hooks/useTasteProfile';
import { rankRecommendations, hasEnoughSignal, topKey } from '../lib/taste';
import { getRecentlyViewed } from '../lib/recentlyViewed';
import { buildProfileDigest } from '../lib/recoDigest';
import { fetchAiRanking, type RecoCandidate } from '../lib/api/aiReco';

// "Gợi ý dành cho bạn" — tự học từ hành vi (tìm kiếm + xem), không cần khách thao tác.
// Hợp nhất tín hiệu thiết bị (localStorage) + tài khoản (khi đăng nhập) qua
// useTasteProfile. Ẩn hoàn toàn khi chưa đủ tín hiệu (khách mới).
export function ForYou({ excludeId, title = 'Gợi ý dành cho bạn' }: { excludeId?: string; title?: string }) {
  const { profile, ready } = useTasteProfile();

  const enough = ready && hasEnoughSignal(profile);
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();

  // Pool ứng viên: BĐS active mới nhất. Chỉ fetch khi đã đủ tín hiệu để gợi ý.
  const { data: pool } = useQuery({
    queryKey: ['forYouPool'],
    queryFn: () => getAllProperties({ sort: 'newest', limit: 60 }),
    enabled: enough,
  });

  // Bước 1 (deterministic, tức thì): lọc pool 60 → top ~12 ứng viên liên quan nhất.
  // Đây vừa là thứ tự hiển thị mặc định, vừa là tập ứng viên gửi cho AI xếp lại.
  const shortlist = useMemo(() => {
    if (!pool?.data) return [];
    const excludeIds = [
      ...(excludeId ? [excludeId] : []),
      ...getRecentlyViewed().map(p => p.id),   // đừng gợi lại tin vừa xem
    ];
    return rankRecommendations(pool.data, profile, { limit: 12, excludeIds });
  }, [pool, profile, excludeId]);

  // Map tên khu vực/loại để làm nhãn + digest ẩn danh cho AI.
  const areaNameById = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a.name])), [areas]);
  const typeNameById = useMemo(() => Object.fromEntries(types.map(t => [t.id, t.name])), [types]);

  // Payload gửi AI: hồ sơ ẩn danh + ứng viên thật (chỉ thuộc tính suy khớp, không PII).
  const digest = useMemo(
    () => buildProfileDigest(profile, { areas: areaNameById, types: typeNameById }),
    [profile, areaNameById, typeNameById],
  );
  const candidates = useMemo<RecoCandidate[]>(() => shortlist.map(p => ({
    id: p.id,
    title: p.title,
    area: p.area_id ? areaNameById[p.area_id] ?? null : null,
    type: p.property_type_id ? typeNameById[p.property_type_id] ?? null : null,
    listingType: p.listing_type,
    price: p.price ?? null,
    priceLabel: p.price_label ?? null,
    district: p.district ?? null,
  })), [shortlist, areaNameById, typeNameById]);

  // Khóa cache ổn định: digest + đúng tập id ứng viên.
  const digestKey = useMemo(
    () => JSON.stringify({ d: digest, ids: candidates.map(c => c.id) }),
    [digest, candidates],
  );

  // Bước 2 (AI, progressive enhancement): xếp lại + lý do. Không chặn render.
  const { data: aiRanked } = useQuery({
    queryKey: ['aiReco', digestKey],
    queryFn: () => fetchAiRanking(digest, candidates),
    enabled: enough && candidates.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Hợp nhất: nếu AI cho kết quả → sắp theo thứ tự AI (chỉ trong shortlist) + gắn lý do;
  // các tin AI không nhắc tới xếp sau (giữ thứ tự deterministic). Chưa có AI → giữ nguyên.
  const recs = useMemo(() => {
    if (!aiRanked?.length) return shortlist.slice(0, 4).map(p => ({ p, aiReason: '' }));
    const byId = new Map(shortlist.map(p => [p.id, p]));
    const reasonById = new Map(aiRanked.map(r => [r.id, r.reason]));
    const ordered: { p: (typeof shortlist)[number]; aiReason: string }[] = [];
    const used = new Set<string>();
    for (const r of aiRanked) {
      const p = byId.get(r.id);
      if (p) { ordered.push({ p, aiReason: r.reason }); used.add(r.id); }
    }
    for (const p of shortlist) {
      if (!used.has(p.id)) ordered.push({ p, aiReason: reasonById.get(p.id) ?? '' });
    }
    return ordered.slice(0, 4);
  }, [aiRanked, shortlist]);

  if (!enough || recs.length === 0) return null;

  // Nhãn "vì bạn quan tâm X" từ khu vực/loại có trọng số cao nhất.
  const topArea = topKey(profile.areaWeights);
  const topType = topKey(profile.typeWeights);
  const areaName = topArea ? areaNameById[topArea] : undefined;
  const typeName = topType ? typeNameById[topType] : undefined;
  const reason = [typeName, areaName].filter(Boolean).join(' · ');

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-red-500" />
        <h2 className="font-black text-gray-900 text-xl">{title}</h2>
        {reason && <span className="text-xs text-gray-400 font-medium">vì bạn quan tâm {reason}</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {recs.map(({ p, aiReason }) => (
          <Link key={p.id} href={buildPropertyPath(p)}
            className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-300 group flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
              <SafeImage src={p.image_url} fallbackSrc={FALLBACK_PROPERTY_IMAGE}
                alt={p.title} fill sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover group-hover:scale-105 transition-transform duration-500" />
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
              {aiReason && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-red-500/90 font-medium leading-snug">
                  <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{aiReason}</span>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
