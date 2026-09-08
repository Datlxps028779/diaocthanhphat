import { NextRequest, NextResponse } from 'next/server';
import { STAFF_PERMISSION_CATALOG } from '@/lib/staffPermissions';
import { requireOwner, callerClient } from '@/lib/server/requireAdmin';

export const runtime = 'nodejs';

const catalog = STAFF_PERMISSION_CATALOG.flatMap(item =>
  item.actions.map(action => ({
    module: item.module,
    action,
    location_scoped: item.locationScoped === true,
  })),
);

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const staffUserId = req.nextUrl.searchParams.get('staffUserId');
  if (!staffUserId) return NextResponse.json({ error: 'Thiếu tài khoản staff.' }, { status: 400 });

  const caller = callerClient(auth.token);
  const { data: permissions, error } = await caller.rpc('get_staff_permissions', {
    p_staff_user_id: staffUserId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ catalog, permissions: permissions ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.staffUserId !== 'string' || !Array.isArray(body.assignments)) {
    return NextResponse.json({ error: 'Dữ liệu phân quyền không hợp lệ.' }, { status: 400 });
  }

  const caller = callerClient(auth.token);
  const { data, error } = await caller.rpc('replace_staff_permissions', {
    p_staff_user_id: body.staffUserId,
    p_permissions: body.assignments,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, count: data ?? 0 });
}
