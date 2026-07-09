// ─── Slug SEO dùng chung (mirror của DB generate_slug) ────────────────────────
// Nguồn chân lý về cú pháp slug nằm ở DB trigger (set_property_slug/set_news_slug).
// Hàm JS này phản chiếu đúng hành vi đó để slug được sinh nhất quán ở tầng ứng
// dụng, không lệ thuộc trigger đã deploy hay chưa. Chỉ admin nhập slug thủ công;
// còn lại luôn auto = tiêu đề (bỏ dấu) + hậu tố ngẫu nhiên chống trùng.

const FALLBACK = 'bat-dong-san';

// Bỏ dấu tiếng Việt + chuẩn hóa về [a-z0-9-], tối đa 80 ký tự.
export function buildSlug(title: string): string {
  if (!title) return FALLBACK;
  const s = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu thanh (à á ả ã ạ…)
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
  return s || FALLBACK;
}

// Slug duy nhất: {slug tiêu đề}-{hậu tố ngẫu nhiên}. Không cần query kiểm tra trùng.
export function buildUniqueSlug(title: string): string {
  return `${buildSlug(title)}-${Math.random().toString(36).slice(2, 6)}`;
}
