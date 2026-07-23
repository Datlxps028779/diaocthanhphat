const DEFAULT_SITE_URL = 'https://diaocthanhphat.com';

export function getSiteUrl(): string {
  const raw = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || DEFAULT_SITE_URL;
  const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.origin.replace(/\/$/, '');
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function absoluteUrl(path: string): string {
  if (!path) return getSiteUrl();
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${getSiteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function canonicalPath(path: string): string {
  if (!path) return '/';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const url = new URL(path);
      return `${url.pathname}${url.search}` || '/';
    } catch {
      return '/';
    }
  }
  return path.startsWith('/') ? path : `/${path}`;
}

// URL công khai để hiển thị/mở trong admin. Ưu tiên origin trình duyệt hiện tại
// (để nút "Mở" trỏ đúng môi trường admin đang đứng — localhost hay production),
// fallback SITE_URL khi chạy SSR. Trả '' khi path rỗng để UI ẩn khối preview.
export function publicBrowserUrl(path: string): string {
  if (!path) return '';
  const p = canonicalPath(path);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${p}`;
  }
  return absoluteUrl(p);
}
