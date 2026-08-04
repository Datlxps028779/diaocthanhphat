// Lớp quyết định thuần cho route ảnh /hinh-anh/{bucket}/{path}.
// Bucket admin-uploads là PRIVATE (chứa cả tài liệu nội bộ ai-docs) nên URL
// /object/public/... của Supabase trả 400. Route ảnh đọc bằng service_role, vì vậy
// đây là chốt chặn duy nhất: chỉ ảnh mới ra ngoài, tài liệu thì không.
export const IMAGE_BUCKETS = ['admin-uploads', 'public-media', 'user-uploads', 'property-images'] as const;

// Thư mục chứa tài liệu nội bộ — không bao giờ phục vụ qua đường ảnh công khai.
export const PRIVATE_FOLDERS = ['ai-docs'] as const;

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'];

export interface ImageRequest {
  bucket: string;
  path: string;
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// Thư mục ảnh do admin tự đặt nhãn lúc upload nên không allowlist được. Bảo vệ bằng
// hai lớp thay thế: chặn thư mục mật + chỉ cho đuôi ảnh đi qua.
export function resolveImageRequest(segments: string[] | undefined): ImageRequest | null {
  const raw = segments ?? [];
  if (raw.length < 3) return null;

  const decoded: string[] = [];
  for (const segment of raw) {
    const value = decode(segment);
    if (!value || !value.trim()) return null;
    if (value.includes('/') || value.includes('\\') || value === '.' || value === '..') return null;
    decoded.push(value);
  }

  const [bucket, ...pathParts] = decoded;
  if (!(IMAGE_BUCKETS as readonly string[]).includes(bucket)) return null;

  const folder = pathParts[0].toLowerCase();
  if ((PRIVATE_FOLDERS as readonly string[]).includes(folder)) return null;

  const filename = pathParts[pathParts.length - 1].toLowerCase();
  if (!IMAGE_EXTENSIONS.some(ext => filename.endsWith(ext))) return null;

  return { bucket, path: pathParts.join('/') };
}
