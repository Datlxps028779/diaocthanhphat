// Engine "tự học" sở thích khách (thuần, test được) — KHÔNG đụng DB/localStorage/đồng hồ.
// Ý tưởng: gom tín hiệu hành vi (tìm kiếm + xem BĐS) → suy hồ sơ sở thích (khu vực/loại/
// khoảng giá hay gặp) → chấm điểm & xếp hạng BĐS ứng viên để tự gợi ý. Chạy client-side
// nên hoạt động cả với khách chưa đăng nhập.

export type SignalKind = 'search' | 'view';

// 1 tín hiệu hành vi đã ghi. Chỉ giữ thuộc tính suy sở thích (không PII).
export interface Signal {
  kind: SignalKind;
  areaId?: string | null;
  typeId?: string | null;
  listingType?: string | null;
  price?: number | null;      // giá BĐS đã xem (view) — bỏ qua với search
  ts: number;                 // epoch ms, để tính trọng số theo độ mới
}

// Hồ sơ sở thích suy ra: trọng số theo khu vực/loại + khoảng giá điển hình.
export interface TasteProfile {
  areaWeights: Record<string, number>;
  typeWeights: Record<string, number>;
  listingTypeWeights: Record<string, number>;
  priceMin?: number;
  priceMax?: number;
  sampleSize: number;         // số tín hiệu dùng để suy (0 = chưa đủ dữ liệu)
}

// View đáng tin hơn search (khách bỏ công xem chi tiết) → trọng số gốc cao hơn.
const KIND_WEIGHT: Record<SignalKind, number> = { view: 2, search: 1 };

// Giảm trọng số theo độ cũ: nửa đời 14 ngày (tín hiệu 14 ngày trước còn ~1/2 sức nặng).
const HALF_LIFE_MS = 14 * 86_400_000;

function recencyWeight(ts: number, now: number): number {
  const age = Math.max(0, now - ts);
  return Math.pow(0.5, age / HALF_LIFE_MS);
}

function bump(map: Record<string, number>, key: string | null | undefined, w: number): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + w;
}

// Suy hồ sơ sở thích từ danh sách tín hiệu. Khoảng giá = min/max của các BĐS đã xem
// (nới ±15% để không quá hẹp). now truyền vào để test tất định.
export function inferTaste(signals: Signal[], now: number): TasteProfile {
  const profile: TasteProfile = { areaWeights: {}, typeWeights: {}, listingTypeWeights: {}, sampleSize: signals.length };
  const viewedPrices: number[] = [];
  for (const s of signals) {
    const w = KIND_WEIGHT[s.kind] * recencyWeight(s.ts, now);
    bump(profile.areaWeights, s.areaId, w);
    bump(profile.typeWeights, s.typeId, w);
    bump(profile.listingTypeWeights, s.listingType, w);
    if (s.kind === 'view' && typeof s.price === 'number' && s.price > 0) viewedPrices.push(s.price);
  }
  if (viewedPrices.length > 0) {
    const min = Math.min(...viewedPrices);
    const max = Math.max(...viewedPrices);
    profile.priceMin = Math.max(0, Math.round(min * 0.85 * 100) / 100);
    profile.priceMax = Math.round(max * 1.15 * 100) / 100;
  }
  return profile;
}

// Trả key có trọng số cao nhất (để hiện nhãn "vì bạn quan tâm X"). null nếu rỗng.
export function topKey(weights: Record<string, number>): string | null {
  let best: string | null = null;
  let bestW = -Infinity;
  for (const [k, w] of Object.entries(weights)) {
    if (w > bestW) { bestW = w; best = k; }
  }
  return best;
}

export function hasEnoughSignal(profile: TasteProfile): boolean {
  return profile.sampleSize >= 2;
}

export interface Candidate {
  id: string;
  area_id: string | null;
  property_type_id: string | null;
  listing_type: string | null;
  price: number;
}

// Chấm điểm 1 BĐS theo hồ sơ: cộng trọng số khu vực/loại/loại-tin khớp + thưởng nếu
// giá nằm trong khoảng ưa thích. Điểm 0 = không liên quan gì.
export function scoreCandidate(c: Candidate, profile: TasteProfile): number {
  let score = 0;
  if (c.area_id && profile.areaWeights[c.area_id]) score += profile.areaWeights[c.area_id] * 3;
  if (c.property_type_id && profile.typeWeights[c.property_type_id]) score += profile.typeWeights[c.property_type_id] * 2;
  if (c.listing_type && profile.listingTypeWeights[c.listing_type]) score += profile.listingTypeWeights[c.listing_type];
  if (profile.priceMin !== undefined && profile.priceMax !== undefined) {
    if (c.price >= profile.priceMin && c.price <= profile.priceMax) score += 2;
  }
  return score;
}

// Xếp hạng ứng viên theo điểm giảm dần, loại điểm 0 (không liên quan) + loại excludeIds.
// Trả tối đa `limit` id. Tie-break giữ thứ tự đầu vào (thường là mới nhất trước).
export function rankRecommendations<T extends Candidate>(
  candidates: T[], profile: TasteProfile, opts: { limit?: number; excludeIds?: string[] } = {}
): T[] {
  const exclude = new Set(opts.excludeIds ?? []);
  const limit = opts.limit ?? 8;
  return candidates
    .filter(c => !exclude.has(c.id))
    .map((c, i) => ({ c, i, s: scoreCandidate(c, profile) }))
    .filter(x => x.s > 0)
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .slice(0, limit)
    .map(x => x.c);
}
