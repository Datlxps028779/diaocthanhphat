import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildLegacyAreaRedirectPath } from '@/lib/areaRedirect';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const LISTING_PATHS = new Set(['/mua-ban', '/cho-thue']);

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!LISTING_PATHS.has(pathname)) return NextResponse.next();

  const areaId = searchParams.get('area');
  if (!areaId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next();

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: area } = await sb.from('areas').select('id,slug').eq('id', areaId).maybeSingle();
    if (!area) return NextResponse.next();

    const { data: districts } = await sb.from('districts').select('area_id,name,slug').eq('area_id', area.id);
    const target = buildLegacyAreaRedirectPath(pathname, searchParams, { area, districts: districts ?? [] });
    if (!target) return NextResponse.next();

    const url = req.nextUrl.clone();
    url.pathname = target.split('?')[0];
    url.search = target.includes('?') ? `?${target.split('?')[1]}` : '';
    return NextResponse.redirect(url, 308);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/mua-ban', '/cho-thue'],
};
