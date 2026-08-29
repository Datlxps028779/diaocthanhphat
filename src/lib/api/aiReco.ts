import { supabase } from '../supabase';
import type { ProfileDigest } from '../recoDigest';

// 1 ứng viên BĐS thật gửi cho lớp AI ranking. Chỉ thuộc tính suy khớp — không PII.
export interface RecoCandidate {
  id: string;
  revision?: string | null;
  title: string;
  area?: string | null;
  type?: string | null;
  listingType?: string | null;
  district?: string | null;
}

export interface AiRankItem {
  id: string;
  reason: string;
}

const SAFE_RECO_REASONS = new Set([
  'Cùng khu vực bạn đang quan tâm',
  'Đúng loại bất động sản bạn thường xem',
  'Phù hợp nhu cầu mua bán của bạn',
  'Phù hợp nhu cầu cho thuê của bạn',
  'Phù hợp nhu cầu cần mua của bạn',
  'Phù hợp nhu cầu cần thuê của bạn',
  'Phù hợp nhu cầu bạn đang tìm',
]);

export function normalizeRecoReason(value: unknown): string {
  if (typeof value !== 'string') return '';
  const reason = value.trim();
  return SAFE_RECO_REASONS.has(reason) ? reason : '';
}

export function buildAiRecoRequestBody(profileDigest: ProfileDigest, candidates: RecoCandidate[]) {
  return { profileDigest, candidateIds: candidates.map(candidate => candidate.id) };
}

// Gọi Edge Function ai-reco để AI xếp lại pool BĐS thật theo hồ sơ ẩn danh + nêu lý do
// mỗi tin. Trả null khi: Edge lỗi/chưa deploy, thiếu key AI, hoặc AI không cho kết quả
// hợp lệ → FE giữ nguyên thứ tự deterministic (progressive enhancement, không chặn UI).
export async function fetchAiRanking(
  profileDigest: ProfileDigest,
  candidates: RecoCandidate[],
): Promise<AiRankItem[] | null> {
  if (!candidates.length) return null;
  const { data, error } = await supabase.functions.invoke('ai-reco', {
    body: buildAiRecoRequestBody(profileDigest, candidates),
  });
  if (error || !data || !Array.isArray(data.ranked)) return null;
  const valid = new Set(candidates.map(c => c.id));
  const seen = new Set<string>();
  const out: AiRankItem[] = [];
  for (const item of data.ranked) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof id !== 'string' || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, reason: normalizeRecoReason(reason) });
  }
  return out.length ? out : null;
}
