import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host || origin !== `${req.nextUrl.protocol}//${host}`) {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Thiếu cấu hình Supabase.' }, { status: 503 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || isAdmin !== true) {
    return NextResponse.json({ error: 'Chỉ admin mới được thực hiện correction.' }, { status: 403 });
  }

  const { data, error } = await supabase.rpc('admin_correct_confirmed_location_conflict');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
