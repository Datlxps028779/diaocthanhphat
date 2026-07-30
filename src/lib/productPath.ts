// URL chi tiết sản phẩm kiểu batdongsan: nối path khu vực + slug + đuôi pr{số} ổn định.
// /{lt}/{areaSlug}/{districtSlug?}/{slug}-pr{public_code}. public_code độc lập tiêu đề/
// khu vực → link không vỡ khi đổi slug, chỉ 301 về canonical mới nhất. Thuần, test được.
import { listingTypeToSlug, type ListingType } from './areaPath';
import { buildSlug } from './slug';

// Đuôi định danh ổn định ở segment cuối. Group 1 = số public_code.
export const PRODUCT_CODE_RE = /-pr(\d+)$/;

// Chỉ cần các field tối thiểu để dựng path (không buộc full Property → test dễ).
export interface ProductPathInput {
  id: string;
  slug?: string | null;
  public_code?: number | null;
  listing_type?: ListingType | string | null;
  district?: string | null;
  areas?: { slug?: string | null } | null;
}

// URL cũ khi thiếu dữ liệu dựng path mới (tin chưa backfill public_code, thiếu areas.slug,
// hoặc listing_type lạ). An toàn tuyệt đối: route /bat-dong-san/[slug] vẫn resolve.
function legacyPath(p: ProductPathInput): string {
  return `/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`;
}

// Dựng path canonical mới. districtSlug lấy từ TÊN quận qua buildSlug (khớp
// districtDisplaySlug dạng gọn "di-an"); slug title giữ nguyên slug DB (đã bỏ dấu).
export function buildProductPath(p: ProductPathInput): string {
  const code = p.public_code;
  const areaSlug = p.areas?.slug?.trim();
  const lt = p.listing_type;
  if (!code || !areaSlug || (lt !== 'mua_ban' && lt !== 'cho_thue')) return legacyPath(p);
  const ltSlug = listingTypeToSlug(lt);
  const districtSlug = p.district?.trim() ? buildSlug(p.district) : undefined;
  const titleSlug = (p.slug && p.slug.trim()) || 'bat-dong-san';
  const segs = [ltSlug, areaSlug, districtSlug, `${titleSlug}-pr${code}`].filter(Boolean);
  return `/${segs.join('/')}`;
}

// Bóc segment cuối của URL: nếu khớp -pr{số} → { code, slug-phần-trước }. Null khi
// không phải đuôi sản phẩm (→ caller coi là listing khu vực).
export function parseProductCode(lastSegment: string): { code: number; slug: string } | null {
  const m = lastSegment.match(PRODUCT_CODE_RE);
  if (!m || m.index === undefined) return null;
  const code = Number(m[1]);
  if (!Number.isFinite(code)) return null;
  return { code, slug: lastSegment.slice(0, m.index) };
}
