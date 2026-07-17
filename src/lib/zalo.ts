// Dựng href zalo.me từ contact_zalo của tin (SĐT hoặc URL đầy đủ) và fallback link
// cấu hình toàn site. contact_zalo admin nhập tự do (VD "0901234567" hoặc
// "https://zalo.me/..."), nên phải phân biệt để không nối nhầm tiền tố.

function toZaloUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('zalo.me/')) return `https://${v}`;
  const digits = v.replace(/\s/g, '');
  return digits ? `https://zalo.me/${digits}` : null;
}

export function buildZaloHref(contactZalo?: string | null, fallback?: string | null): string | null {
  return toZaloUrl(contactZalo ?? '') ?? toZaloUrl(fallback ?? '');
}
