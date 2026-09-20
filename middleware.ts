import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildLegacyAreaRedirectPath } from '@/lib/areaRedirect';
import { buildProductPath, parseProductCode } from '@/lib/productPath';
import { checkLocalityRequest } from '@/lib/localityRequest';
import { buildLocalityGeoAreaAllowlist, LOCALITY_NEWS_MINIMUM } from '@/lib/localityNewsMatch';
import { decodePublicNewsRouteSegment } from '@/lib/slug';
import { evaluateLocalityNews } from '@/lib/localityNewsEvaluation';
import { loadLocalityNewsSnapshot } from '@/lib/server/localityNewsSnapshotTransport';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const LISTING_PATHS = new Set(['/mua-ban', '/cho-thue']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_PREFIX = '/bat-dong-san/';

function sbClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function redirectTo(req: NextRequest, path: string, preserveRequestSearch = false): NextResponse {
  const url = req.nextUrl.clone();
  const [p, qs] = path.split('?');
  url.pathname = p;
  url.search = qs ? `?${qs}` : preserveRequestSearch ? req.nextUrl.search : '';
  return NextResponse.redirect(url, 308);
}

// Root loading.tsx stream shell 200 trước khi page-level notFound() chạy. Với URL
// sản phẩm mới pr{code}, middleware trả 404 ngay từ đầu rồi rewrite tới route không tồn
// tại để giữ UI not-found thương hiệu + HTTP status 404 thật cho crawler.
function productNotFound(req: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL('/_product-not-found', req.url), { status: 404 });
}

function newsNotFound(req: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL('/_news-not-found', req.url), { status: 404 });
}

function localityUnavailable(): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Dữ liệu tạm thời chưa sẵn sàng</title><body style="font-family:system-ui;padding:24px;max-width:640px;margin:auto"><h1>Chưa tải được dữ liệu địa phương</h1><p>Nguồn dữ liệu tạm thời chưa phản hồi đầy đủ. Vui lòng tải lại trang sau ít phút. Không có số liệu được công bố từ dữ liệu chưa hoàn tất.</p><a href="/khu-vuc">Về danh sách khu vực</a></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '60', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } },
  );
}

async function localityResponse(req: NextRequest): Promise<NextResponse> {
  const result = await checkLocalityRequest(req.nextUrl.pathname, { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  if (result.status === 'not-found') return NextResponse.rewrite(new URL('/_locality-not-found', req.url), { status: 404 });
  if (result.status === 'unavailable') return localityUnavailable();
  return result.path !== req.nextUrl.pathname ? redirectTo(req, result.path, true) : NextResponse.next();
}

async function localityNewsResponse(req: NextRequest, areaSlug: string): Promise<NextResponse> {
  const localityPath = `/khu-vuc/${areaSlug}`;
  const locality = await checkLocalityRequest(localityPath, { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  if (locality.status === 'not-found') return NextResponse.rewrite(new URL('/_locality-not-found', req.url), { status: 404 });
  if (locality.status === 'unavailable') return localityUnavailable();

  try {
    const client = sbClient();
    const { data: area, error: areaError } = await client
      .from('areas')
      .select('id,name,slug')
      .eq('slug', areaSlug)
      .maybeSingle();
    if (areaError || !area?.id || !area.name || area.slug !== areaSlug) return localityUnavailable();

    const snapshot = await loadLocalityNewsSnapshot({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
    const evaluation = evaluateLocalityNews(
      snapshot,
      area.id,
      buildLocalityGeoAreaAllowlist(area.name),
      1,
    );
    if (evaluation.total < LOCALITY_NEWS_MINIMUM) {
      return NextResponse.rewrite(new URL('/_locality-not-found', req.url), { status: 404 });
    }
    return NextResponse.next();
  } catch {
    return localityUnavailable();
  }
}

function privateNotFound(req: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL('/_private-not-found', req.url), { status: 404 });
}

async function checkPrivateAccess(req: NextRequest, res: NextResponse): Promise<{ owner: boolean; ownerMfa: boolean; staff: boolean }> {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        for (const cookie of cookies) res.cookies.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { owner: false, ownerMfa: false, staff: false };
  const [{ data: owner }, { data: ownerMfa }, { data: staff }] = await Promise.all([
    supabase.rpc('is_owner'),
    supabase.rpc('is_owner_mfa'),
    supabase.rpc('is_admin_or_staff'),
  ]);
  return { owner: owner === true, ownerMfa: ownerMfa === true, staff: staff === true };
}

// Middleware chạy TRƯỚC khi Next stream shell (root loading.tsx flush 200 sớm), nên đây
// là chỗ DUY NHẤT set được status redirect cứng (308) cho link cũ đã share/index.
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const privatePath = pathname.startsWith('/quantrihethong') || pathname.startsWith('/noi-bo') || pathname.startsWith('/xac-thuc-chu-he-thong');
  const newsSegments = pathname.split('/').filter(Boolean);
  if (newsSegments[0] === 'tin-tuc') {
    return newsSegments.length === 2 && !decodePublicNewsRouteSegment(newsSegments[1])
      ? newsNotFound(req)
      : NextResponse.next();
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return privatePath ? privateNotFound(req) : NextResponse.next();
  }

  try {
    if (privatePath) {
      const res = NextResponse.next();
      const access = await checkPrivateAccess(req, res);
      const allowed = pathname.startsWith('/quantrihethong')
        ? access.ownerMfa
        : pathname.startsWith('/noi-bo')
          ? access.staff
          : access.owner;
      return allowed ? res : privateNotFound(req);
    }

    if (pathname.startsWith('/khu-vuc/')) {
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 3 && segments[0] === 'khu-vuc' && segments[2] === 'tin-tuc') {
        return localityNewsResponse(req, segments[1]);
      }
      return localityResponse(req);
    }

    const sb = sbClient();

    // A. URL khu vực cũ: /mua-ban|/cho-thue?area=<uuid> → path khu vực mới.
    if (LISTING_PATHS.has(pathname)) {
      const areaId = searchParams.get('area');
      if (!areaId) return NextResponse.next();
      const { data: area } = await sb.from('areas').select('id,slug').eq('id', areaId).maybeSingle();
      if (!area) return NextResponse.next();
      const { data: districts } = await sb.from('districts').select('area_id,name,slug').eq('area_id', area.id);
      const target = buildLegacyAreaRedirectPath(pathname, searchParams, { area, districts: districts ?? [] });
      return target ? redirectTo(req, target) : NextResponse.next();
    }

    // B. URL sản phẩm mới nhưng slug/path lạc (vd đổi tiêu đề/quận): pr{code} là khóa
    // thật → hard 308 về canonical. Cần middleware vì root loading.tsx khiến redirect
    // từ server page soft-200. Listing khu vực không có đuôi -pr{số} → đi qua bình thường.
    if (pathname.startsWith('/mua-ban/') || pathname.startsWith('/cho-thue/')) {
      let lastSegment: string;
      try { lastSegment = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? ''); }
      catch { return NextResponse.rewrite(new URL('/_locality-not-found', req.url), { status: 404 }); }
      const parsed = parseProductCode(lastSegment);
      if (!parsed) return localityResponse(req);
      const { data: p, error } = await sb
        .from('properties')
        .select('id,slug,public_code,listing_type,district,areas(slug)')
        .eq('public_code', parsed.code)
        .eq('is_active', true)
        .maybeSingle();
      if (error) return NextResponse.next();
      if (!p) return productNotFound(req);
      const target = buildProductPath(p as unknown as Parameters<typeof buildProductPath>[0]);
      return target !== pathname ? redirectTo(req, target, true) : NextResponse.next();
    }

    // C. URL sản phẩm cũ: /bat-dong-san/{slug|uuid} → URL mới. Thiếu public_code →
    // buildProductPath fallback = chính path cũ (theo slug) → không redirect (tránh loop);
    // uuid→slug vẫn được canonical hoá.
    if (pathname.startsWith(PRODUCT_PREFIX)) {
      const seg = decodeURIComponent(pathname.slice(PRODUCT_PREFIX.length));
      if (!seg || seg.includes('/')) return NextResponse.next();
      const col = UUID_RE.test(seg) ? 'id' : 'slug';
      const { data: p } = await sb
        .from('properties')
        .select('id,slug,public_code,listing_type,district,areas(slug)')
        .eq(col, seg)
        .eq('is_active', true)
        .maybeSingle();
      if (!p) return NextResponse.next();
      const target = buildProductPath(p as unknown as Parameters<typeof buildProductPath>[0]);
      return target !== pathname ? redirectTo(req, target, true) : NextResponse.next();
    }

    return NextResponse.next();
  } catch {
    return privatePath ? privateNotFound(req) : NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/mua-ban', '/mua-ban/:path*', '/cho-thue', '/cho-thue/:path*', '/bat-dong-san/:slug*', '/khu-vuc/:path*',
    '/tin-tuc/:path*',
    '/quantrihethong', '/quantrihethong/:path*', '/noi-bo', '/noi-bo/:path*',
    '/xac-thuc-chu-he-thong',
  ],
};
