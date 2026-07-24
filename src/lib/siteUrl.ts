const DEFAULT_SITE_URL = 'https://chonhaviet.com';
const BRANDED_IMAGE_PREFIX = '/hinh-anh';

export type StorageImagePath = { bucket: string; path: string };

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

export function publicImageUrlToStoragePath(url: string | null | undefined): StorageImagePath | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, getSiteUrl());
    const storageMarker = '/storage/v1/object/public/';
    const storageIndex = parsed.pathname.indexOf(storageMarker);
    const brandedPrefix = `${BRANDED_IMAGE_PREFIX}/`;
    let parts: string[] = [];

    if (storageIndex !== -1) {
      const rest = parsed.pathname.slice(storageIndex + storageMarker.length);
      parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
    } else if (parsed.origin === getSiteUrl() && parsed.pathname.startsWith(brandedPrefix)) {
      const rest = parsed.pathname.slice(brandedPrefix.length);
      parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
    }

    if (parts.length < 2) return null;
    const [bucket, ...pathParts] = parts;
    const path = pathParts.join('/');
    return bucket && path ? { bucket, path } : null;
  } catch {
    return null;
  }
}

export function storageUrlToPublicImageUrl(url: string | null | undefined): string {
  const raw = url?.trim() ?? '';
  if (!raw) return '';
  const storage = publicImageUrlToStoragePath(raw);
  if (!storage) return raw;
  const path = storage.path.split('/').map(encodeURIComponent).join('/');
  return `${getSiteUrl()}${BRANDED_IMAGE_PREFIX}/${encodeURIComponent(storage.bucket)}/${path}`;
}

export function normalizePublicImageUrl(url: string | null | undefined): string {
  const raw = url?.trim() ?? '';
  if (!raw) return '';
  if (/^(data|blob|javascript):/i.test(raw)) return '';
  const storage = storageUrlToPublicImageUrl(raw);
  if (storage !== raw) return storage;
  if (raw.startsWith('/')) return absoluteUrl(raw);
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
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
