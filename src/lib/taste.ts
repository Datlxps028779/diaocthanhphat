// Engine "tự học" sở thích khách (thuần, test được) — KHÔNG đụng DB/localStorage/đồng hồ.
// Ý tưởng: gom tín hiệu hành vi (tìm kiếm + xem + yêu thích + liên hệ) → suy hồ sơ sở thích
// (khu vực/loại/khoảng giá hay gặp) → chấm điểm & xếp hạng BĐS ứng viên để tự gợi ý. Chạy
// client-side nên hoạt động cả với khách chưa đăng nhập.

export type SignalKind = 'search' | 'view' | 'favorite' | 'contact';

// 1 tín hiệu hành vi đã ghi. Chỉ giữ thuộc tính suy sở thích (không PII).
export interface Signal {
  kind: SignalKind;
  eventId?: string | null;
  areaId?: string | null;
  typeId?: string | null;
  listingType?: string | null;
  price?: number | null;      // legacy/reserved; không dùng cho ranking khi chưa chuẩn hóa đơn vị
  ts: number;                 // epoch ms, để tính trọng số theo độ mới
}

export type SignalAttrs = Omit<Signal, 'kind' | 'eventId' | 'ts'>;

export function createSignalEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function normalizeSignalAttrs(attrs: SignalAttrs): SignalAttrs {
  return {
    areaId: attrs.areaId || null,
    typeId: attrs.typeId || null,
    listingType: attrs.listingType || null,
    price: typeof attrs.price === 'number' && Number.isFinite(attrs.price) && attrs.price > 0
      ? attrs.price
      : null,
  };
}

export function signalDedupeKey(kind: SignalKind, attrs: SignalAttrs): string {
  const normalized = normalizeSignalAttrs(attrs);
  return JSON.stringify([
    kind,
    normalized.areaId,
    normalized.typeId,
    normalized.listingType,
    normalized.price,
  ]);
}

export function mergeSignalSources(local: Signal[], remote: Signal[]): Signal[] {
  const remoteEventIds = new Set(
    remote.map(signal => signal.eventId).filter((id): id is string => Boolean(id)),
  );
  return [
    ...remote,
    ...local.filter(signal => !signal.eventId || !remoteEventIds.has(signal.eventId)),
  ].sort((a, b) => b.ts - a.ts);
}

// Hồ sơ sở thích suy ra: trọng số theo khu vực/loại/hình thức.
export interface TasteProfile {
  areaWeights: Record<string, number>;
  typeWeights: Record<string, number>;
  listingTypeWeights: Record<string, number>;
  sampleSize: number;         // số tín hiệu dùng để suy (0 = chưa đủ dữ liệu)
}

// Ý định càng mạnh → trọng số càng cao. Liên hệ (để lại SĐT) = ý định mua rõ nhất,
// yêu thích = giữ lại để ngắm, xem = bỏ công đọc chi tiết, tìm kiếm = duyệt lướt.
const KIND_WEIGHT: Record<SignalKind, number> = { contact: 4, favorite: 3, view: 2, search: 1 };

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

// Bù ý định trong phiên: tín hiệu trong cửa sổ gần (sessionWindowMs) được nhân thêm
// sessionBoost để hành vi "ngay lúc này" nổi lên trên hồ sơ dài hạn (nửa-đời 14 ngày
// quá chậm bắt kịp phiên). Mặc định tắt (opts undefined) → hành vi cũ giữ nguyên.
export interface InferOpts {
  sessionWindowMs?: number;
  sessionBoost?: number;
}

// Suy hồ sơ sở thích từ danh sách tín hiệu. Price personalization tạm thời không
// tham gia profile/ranking cho đến khi giá bán và thuê được chuẩn hóa theo listing type.
export function inferTaste(signals: Signal[], now: number, opts?: InferOpts): TasteProfile {
  const profile: TasteProfile = { areaWeights: {}, typeWeights: {}, listingTypeWeights: {}, sampleSize: signals.length };
  for (const s of signals) {
    const inSession = opts?.sessionWindowMs !== undefined && now - s.ts <= opts.sessionWindowMs;
    const boost = inSession ? (opts?.sessionBoost ?? 1) : 1;
    const w = KIND_WEIGHT[s.kind] * recencyWeight(s.ts, now) * boost;
    bump(profile.areaWeights, s.areaId, w);
    bump(profile.typeWeights, s.typeId, w);
    bump(profile.listingTypeWeights, s.listingType, w);
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

// Đa dạng hóa danh sách đã xếp hạng: không để 1 nhóm (vd cùng khu vực) chiếm quá
// maxPerKey chỗ trong top. Duyệt theo thứ tự vào (đã xếp điểm/AI), nhận item nếu key
// chưa đầy; nếu chưa đủ `limit` thì backfill các item đã bỏ (giữ nguyên thứ tự) để
// luôn đủ số lượng. key null (không phân loại được) không bị giới hạn.
export function diversify<T>(
  items: T[], keyFn: (x: T) => string | null, opts: { maxPerKey: number; limit: number }
): T[] {
  const counts = new Map<string, number>();
  const picked: T[] = [];
  const skipped: T[] = [];
  for (const item of items) {
    if (picked.length >= opts.limit) break;
    const key = keyFn(item);
    if (key === null) { picked.push(item); continue; }
    const n = counts.get(key) ?? 0;
    if (n < opts.maxPerKey) {
      counts.set(key, n + 1);
      picked.push(item);
    } else {
      skipped.push(item);
    }
  }
  for (const item of skipped) {
    if (picked.length >= opts.limit) break;
    picked.push(item);
  }
  return picked;
}
