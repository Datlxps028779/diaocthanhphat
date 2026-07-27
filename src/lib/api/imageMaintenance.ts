import { supabase } from '../supabase';
import { publicImageUrlToStoragePath, storageUrlToPublicImageUrl } from '../siteUrl';
import { compressImage } from '../imageCompress';

// Công cụ nén ảnh CŨ đã upload (admin-only). Quét các cột ảnh NỘI DUNG thật trong DB,
// nén-đè lên đúng path trên storage (upsert:true) → URL không đổi → KHÔNG phải sửa DB.
// Chạy client-side trong trình duyệt admin (Canvas + fetch same-origin qua /hinh-anh).
// KHÔNG đụng logo/og_image/avatar (ảnh thương hiệu, thường trong suốt).

export interface ScannedImage {
  table: string;
  label: string; // nhãn hiển thị (tên tin/sản phẩm) để admin biết ảnh của gì
  url: string;
}

// Các cột ảnh nội dung cần quét. Bỏ avatar/logo/og_image (ảnh thương hiệu/trong suốt).
// Mỗi nguồn: bảng + cột đơn (image_url) và/hoặc cột mảng (images[]).
async function scanTable(
  table: string,
  singleCol: string | null,
  arrayCol: string | null,
  labelCol: string,
): Promise<ScannedImage[]> {
  const cols = ['id', labelCol, singleCol, arrayCol].filter(Boolean).join(', ');
  const { data, error } = await supabase.from(table).select(cols);
  if (error || !data) return [];
  const out: ScannedImage[] = [];
  for (const row of data as unknown as Record<string, unknown>[]) {
    const label = (row[labelCol] as string | null)?.trim() || `${table} ${row.id as string}`;
    if (singleCol) {
      const u = (row[singleCol] as string | null)?.trim();
      if (u) out.push({ table, label, url: u });
    }
    if (arrayCol) {
      const arr = row[arrayCol] as string[] | null;
      if (Array.isArray(arr)) {
        for (const u of arr) {
          if (u && u.trim()) out.push({ table, label, url: u.trim() });
        }
      }
    }
  }
  return out;
}

// Quét toàn bộ cột ảnh nội dung thật. Trả danh sách ảnh (đã khử trùng theo url).
export async function adminScanImages(): Promise<ScannedImage[]> {
  const results = await Promise.all([
    scanTable('properties', 'image_url', 'images', 'title'),
    scanTable('news', 'image_url', null, 'title'),
    scanTable('neighborhoods', 'image_url', null, 'name'),
    scanTable('projects', 'image_url', 'images', 'name'),
    scanTable('banners', 'image_url', null, 'title'),
  ]);
  const all = results.flat();
  const seen = new Set<string>();
  const unique: ScannedImage[] = [];
  for (const img of all) {
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    unique.push(img);
  }
  return unique;
}

export interface CompressResult {
  url: string;
  before: number;
  after: number;
  skipped: boolean;
  reason?: string;
}

// Nén 1 ảnh cũ: fetch same-origin (qua /hinh-anh proxy → không taint canvas) → nén →
// nếu nhỏ hơn đáng kể thì upsert đè đúng path (giữ URL). Trả số liệu before/after.
export async function compressExistingImage(url: string): Promise<CompressResult> {
  const storage = publicImageUrlToStoragePath(url);
  if (!storage) return { url, before: 0, after: 0, skipped: true, reason: 'không nhận diện được path storage' };

  // Fetch qua branded URL same-origin để canvas không bị taint (CORS).
  const fetchUrl = storageUrlToPublicImageUrl(url);
  let blob: Blob;
  try {
    const resp = await fetch(fetchUrl);
    if (!resp.ok) return { url, before: 0, after: 0, skipped: true, reason: `tải ảnh lỗi HTTP ${resp.status}` };
    blob = await resp.blob();
  } catch {
    return { url, before: 0, after: 0, skipped: true, reason: 'tải ảnh thất bại' };
  }

  const before = blob.size;
  const nameFromPath = storage.path.split('/').pop() || 'image';
  const original = new File([blob], nameFromPath, { type: blob.type });
  const compressed = await compressImage(original);

  // compressImage trả nguyên file nếu không nén được / không nhỏ hơn.
  if (compressed === original || compressed.size >= before) {
    return { url, before, after: before, skipped: true, reason: 'không nén nhỏ hơn được' };
  }

  // Đè đúng path cũ (giữ URL). Set contentType theo định dạng đã nén (PNG→JPEG vẫn
  // giữ path .png nhưng Content-Type là image/jpeg → Zalo/FB đọc đúng theo header).
  const { error } = await supabase.storage.from(storage.bucket).upload(storage.path, compressed, {
    upsert: true,
    contentType: compressed.type,
  });
  if (error) return { url, before, after: before, skipped: true, reason: error.message };

  // Cập nhật user_media.size_bytes nếu có record khớp url (best-effort, không chặn).
  try {
    await supabase.from('user_media').update({ size_bytes: compressed.size, mime_type: compressed.type }).eq('url', url);
  } catch { /* silent */ }

  return { url, before, after: compressed.size, skipped: false };
}
