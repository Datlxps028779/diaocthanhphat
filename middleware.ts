import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildLegacyAreaRedirectPath } from '@/lib/areaRedirect';
import { buildProductPath, parseProductCode } from '@/lib/productPath';

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

// Middleware chạy TRƯỚC khi Next stream shell (root loading.tsx flush 200 sớm), nên đây
// là chỗ DUY NHẤT set được status redirect cứng (308) cho link cũ đã share/index.
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next();

  try {
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
      const lastSegment = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
      const parsed = parseProductCode(lastSegment);
      if (!parsed) return NextResponse.next();
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
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/mua-ban', '/mua-ban/:path*', '/cho-thue', '/cho-thue/:path*', '/bat-dong-san/:slug*'],
};
