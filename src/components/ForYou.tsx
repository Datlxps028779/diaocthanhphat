'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllProperties } from '../lib/api';
import { useAreas, usePropertyTypes } from '../lib/hooks/useTaxonomy';
import { useTasteProfile } from '../lib/hooks/useTasteProfile';
import { rankRecommendations, hasEnoughSignal, topKey, diversify } from '../lib/taste';
import { getRecentlyViewed } from '../lib/recentlyViewed';
import { buildProfileDigest } from '../lib/recoDigest';
import { fetchAiRanking, type RecoCandidate } from '../lib/api/aiReco';
import { PropertyDiscoveryRail } from './discovery/PropertyDiscoveryRail';
import type { DiscoverySurface } from '../lib/discoveryJourney';

// "Gợi ý dành cho bạn" — tự học từ hành vi (tìm kiếm + xem), không cần khách thao tác.
// Hợp nhất tín hiệu thiết bị (localStorage) + tài khoản (khi đăng nhập) qua
// useTasteProfile. Ẩn hoàn toàn khi chưa đủ tín hiệu (khách mới).
export function ForYou({
  excludeId,
  title = 'Gợi ý dành cho bạn',
  surface,
  source,
}: {
  excludeId?: string;
  title?: string;
  surface: DiscoverySurface;
  source?: string;
}) {
  const { profile, ready } = useTasteProfile();
  const gateRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  const enough = ready && hasEnoughSignal(profile);
  const areasQuery = useAreas();
  const typesQuery = usePropertyTypes();
  const areas = areasQuery.data ?? [];
  const types = typesQuery.data ?? [];
  const taxonomyReady = areasQuery.isSuccess && typesQuery.isSuccess;

  useEffect(() => {
    if (!enough || nearViewport) return;
    const node = gateRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enough, nearViewport]);

  // Pool ứng viên: BĐS active mới nhất. Chỉ fetch khi đã đủ tín hiệu và rail sắp vào viewport.
  const { data: pool } = useQuery({
    queryKey: ['forYouPool'],
    queryFn: () => getAllProperties({ sort: 'newest', limit: 60 }),
    enabled: enough && nearViewport,
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
    revision: p.updated_at,
    title: p.title,
    area: p.area_id ? areaNameById[p.area_id] ?? null : null,
    type: p.property_type_id ? typeNameById[p.property_type_id] ?? null : null,
    listingType: p.listing_type,
    district: p.district ?? null,
  })), [shortlist, areaNameById, typeNameById]);

  // Khóa cache ổn định: digest + đúng tập id ứng viên.
  const digestKey = useMemo(
    () => JSON.stringify({ d: digest, candidates: [...candidates].sort((a, b) => a.id.localeCompare(b.id)) }),
    [digest, candidates],
  );

  // Bước 2 (AI, progressive enhancement): xếp lại + lý do. Không chặn render.
  const { data: aiRanked } = useQuery({
    queryKey: ['aiReco', digestKey],
    queryFn: () => fetchAiRanking(digest, candidates),
    enabled: enough && nearViewport && taxonomyReady && candidates.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Hợp nhất: nếu AI cho kết quả → sắp theo thứ tự AI (chỉ trong shortlist).
  // Chưa có AI → giữ nguyên thứ tự deterministic.
  const recs = useMemo(() => {
    // Đa dạng hóa top-4: không để 1 khu vực chiếm >2 chỗ (tránh 4 tin y hệt), vẫn đủ 4 tin.
    const pick = (list: typeof shortlist) => diversify(list, x => x.area_id, { maxPerKey: 2, limit: 4 });
    if (!aiRanked?.length) return pick(shortlist);
    const byId = new Map(shortlist.map(p => [p.id, p]));
    const ordered = aiRanked.map(r => byId.get(r.id)).filter((p): p is (typeof shortlist)[number] => !!p);
    const used = new Set(ordered.map(p => p.id));
    return pick([...ordered, ...shortlist.filter(p => !used.has(p.id))]);
  }, [aiRanked, shortlist]);

  const safeReasons = useMemo(
    () => new Map((aiRanked ?? []).filter(item => item.reason).map(item => [item.id, item.reason])),
    [aiRanked],
  );

  if (!enough) return null;
  if (!nearViewport) return <div ref={gateRef} className="h-px" aria-hidden="true" />;
  if (recs.length === 0) return null;

  // Nhãn "vì bạn quan tâm X" từ khu vực/loại có trọng số cao nhất.
  const topArea = topKey(profile.areaWeights);
  const topType = topKey(profile.typeWeights);
  const areaName = topArea ? areaNameById[topArea] : undefined;
  const typeName = topType ? typeNameById[topType] : undefined;
  const reason = [typeName, areaName].filter(Boolean).join(' · ');

  return (
    <PropertyDiscoveryRail
      title={title}
      subtitle={reason ? `Dựa trên mối quan tâm của bạn: ${reason}` : undefined}
      properties={recs}
      surface={surface}
      module="for_you"
      source={source ?? `${surface}_for_you`}
      itemNote={property => safeReasons.get(property.id)}
    />
  );
}
