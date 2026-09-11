// ─── Slug SEO dùng chung ───────────────────────────────────────────────────────

const FALLBACK = 'bat-dong-san';

// Canonical public slugs are intentionally lower-case ASCII segments. Keep this
// predicate shared by sitemap and Search Visibility so invalid source rows are
// excluded consistently instead of being emitted with an ID/raw-slug fallback.
export function isValidSlug(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim()));
}

// Safe legacy segment used only for purging an old cached public URL. This is
// intentionally broader than isValidSlug so a previously published malformed
// slug (for example a trailing hyphen) can still be invalidated without ever
// allowing a slash, query, or hash into revalidatePath.
export function isSafePublicSlugSegment(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && /^[A-Za-z0-9][A-Za-z0-9-]{0,219}$/.test(value.trim()));
}

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
