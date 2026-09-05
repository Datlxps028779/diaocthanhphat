// ─── Slug SEO dùng chung ───────────────────────────────────────────────────────

const FALLBACK = 'bat-dong-san';

// Bỏ dấu tiếng Việt + chuẩn hóa về [a-z0-9-], tối đa 80 ký tự.
export function buildSlug(title: string): string {
  if (!title) return FALLBACK;
  const s = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
  return s || FALLBACK;
}

// Slug hồ sơ mới dùng base readable; database thêm mã ID random ổn định khi tạo profile.
export function buildAgentProfileSlug(displayName: string): string {
  return buildSlug(displayName);
}

// Giữ API cũ cho các entity cần hậu tố ngẫu nhiên trong lúc chưa migrate riêng.
export function buildUniqueSlug(title: string): string {
  return `${buildSlug(title)}-${Math.random().toString(36).slice(2, 6)}`;
}
