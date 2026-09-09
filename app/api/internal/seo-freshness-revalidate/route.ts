import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

const STATIC_PATHS = new Set([
  '/', '/danh-sach', '/mua-ban', '/cho-thue', '/khu-vuc', '/khu-dan-cu',
  '/du-an', '/dau-tu', '/tin-tuc', '/kien-thuc', '/ve-chung-toi', '/so-sanh',
  '/dinh-gia', '/du-lieu-gia', '/sitemap.xml', '/sitemap-images.xml',
]);
const DYNAMIC_PATHS = [
  /^\/(?:mua-ban|cho-thue)\/[a-z0-9-]+(?:\/[a-z0-9-]+){0,3}$/,
  /^\/bat-dong-san\/[a-z0-9-]+$/,
  /^\/khu-vuc\/[a-z0-9-]+$/,
  /^\/khu-dan-cu\/[a-z0-9-]+$/,
  /^\/tin-tuc\/[a-z0-9-]+$/,
  /^\/tin-tuc\/danh-muc\/[a-z0-9-]+$/,
  /^\/trang\/[a-z0-9-]+$/,
];

function sameSecret(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAllowedPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('?') || value.includes('#') || value.includes('//')) return false;
  return STATIC_PATHS.has(value) || DYNAMIC_PATHS.some(pattern => pattern.test(value));
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.SEO_FRESHNESS_INTERNAL_SECRET?.trim();
  if (!expectedSecret) return NextResponse.json({ error: 'Chưa cấu hình freshness worker.' }, { status: 503 });
  if (!sameSecret(expectedSecret, req.headers.get('x-seo-freshness-secret'))) {
    return NextResponse.json({ error: 'Không được phép.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { paths?: unknown } | null;
  if (!body || !Array.isArray(body.paths) || body.paths.length < 1 || body.paths.length > 100
      || !body.paths.every(isAllowedPath)) {
    return NextResponse.json({ error: 'Danh sách path không hợp lệ.' }, { status: 400 });
  }

  for (const path of [...new Set(body.paths)]) revalidatePath(path);
  return NextResponse.json({ ok: true, count: new Set(body.paths).size }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
