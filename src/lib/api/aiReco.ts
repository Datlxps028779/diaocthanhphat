import { supabase } from '../supabase';
import type { ProfileDigest } from '../recoDigest';

// 1 ứng viên BĐS thật gửi cho lớp AI ranking. Chỉ thuộc tính suy khớp — không PII.
export interface RecoCandidate {
  id: string;
  title: string;
  area?: string | null;
  type?: string | null;
  listingType?: string | null;
  price?: number | null;
  priceLabel?: string | null;
  district?: string | null;
}

export interface AiRankItem {
  id: string;
  reason: string;
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
    body: { profileDigest, candidates },
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
    out.push({ id, reason: typeof reason === 'string' ? reason.trim() : '' });
  }
  return out.length ? out : null;
}
