import type { TasteProfile } from './taste';

// Hồ sơ sở thích ĐÃ ẨN DANH gửi cho lớp AI ranking (Edge ai-reco). Chỉ tên khu vực,
// loại và hình thức ưa thích đã map id→tên. KHÔNG id thô, lịch sử, giá chưa chuẩn hóa
// hoặc PII. AI chỉ dùng để hiểu "gu" khách rồi xếp lại pool BĐS thật.
export interface ProfileDigest {
  areas: string[];
  types: string[];
  listingTypes: string[];
}

export interface DigestLabels {
  areas?: Record<string, string>;
  types?: Record<string, string>;
}

// Các key có trọng số > 0, xếp trọng số giảm dần (chưa cắt số lượng).
function rankedKeys(weights: Record<string, number>): string[] {
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

// Map id→tên (bỏ id không có nhãn) RỒI mới cắt top `n` — để id không nhãn không
// chiếm mất suất của id kế tiếp có nhãn.
function topLabels(weights: Record<string, number>, labels: Record<string, string> | undefined, n: number): string[] {
  const out: string[] = [];
  for (const id of rankedKeys(weights)) {
    const label = labels?.[id];
    if (label) out.push(label);
    if (out.length >= n) break;
  }
  return out;
}

const LISTING_LABELS: Record<string, string> = { mua_ban: 'mua bán', cho_thue: 'cho thuê' };

// Suy digest ẩn danh từ hồ sơ: 3 khu vực + 3 loại ưa thích nhất (map id→tên, bỏ id
// không có nhãn) và hình thức. Giá tạm loại khỏi profile đến khi được chuẩn hóa.
export function buildProfileDigest(profile: TasteProfile, labels: DigestLabels = {}): ProfileDigest {
  const areas = topLabels(profile.areaWeights, labels.areas, 3);
  const types = topLabels(profile.typeWeights, labels.types, 3);
  const listingTypes = rankedKeys(profile.listingTypeWeights)
    .slice(0, 2)
    .map(k => LISTING_LABELS[k] ?? k);

  return { areas, types, listingTypes };
}
