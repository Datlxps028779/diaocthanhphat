import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminUserAction } from '@/lib/adminUserAction';

// API route quản lý người dùng cho admin. Chạy SERVER-SIDE (service_role không bao giờ
// tới client). Thiết kế degrade an toàn:
//  - GET danh sách: nếu có service_role → kèm email + trạng thái khóa (đọc auth.users);
//    thiếu key → vẫn trả profiles qua RLS admin (không có email), không sập.
//  - POST hành động (set_role/ban/unban): BẮT BUỘC service_role → thiếu key trả 503.
// Mọi request phải kèm Bearer access_token của một admin — route tự xác thực trước.

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client gắn token của caller — dùng để xác thực danh tính + quyền qua RLS.
function callerClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Client service_role — BỎ QUA RLS, chỉ tạo khi có key. null nếu chưa cấu hình.
function adminClient() {
  if (!SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Xác thực caller là admin. Trả userId nếu hợp lệ, hoặc lỗi kèm HTTP status.
async function requireAdmin(req: NextRequest): Promise<{ ok: true; token: string } | { ok: false; status: number; msg: string }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return { ok: false, status: 401, msg: 'Chưa đăng nhập.' };
  const client = callerClient(token);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false, status: 401, msg: 'Phiên đăng nhập không hợp lệ.' };
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { ok: false, status: 403, msg: 'Tài khoản không có quyền quản trị.' };
  }
  return { ok: true, token };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  // profiles luôn đọc được (RLS admin). Là nguồn tên/SĐT/role.
  const caller = callerClient(auth.token);
  const { data: profiles, error: pErr } = await caller
    .from('profiles')
    .select('id, display_name, phone, role, created_at')
    .order('created_at', { ascending: false });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const admin = adminClient();
  // Thiếu service_role → trả profiles không kèm email/khóa, kèm cờ để UI báo.
  if (!admin) {
    const users = (profiles ?? []).map(p => ({ ...p, email: null, banned: false }));
    return NextResponse.json({ users, serviceRole: false });
  }

  // Có service_role → lấy email + trạng thái khóa từ auth.users, ghép theo id.
  const authList: { id: string; email: string | null; banned: boolean }[] = [];
  let page = 1;
  // listUsers phân trang 1000/lần; site nhỏ nhưng vẫn lặp cho đúng.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const u of data.users) {
      const bannedUntil = (u as { banned_until?: string | null }).banned_until;
      authList.push({ id: u.id, email: u.email ?? null, banned: !!bannedUntil && new Date(bannedUntil) > new Date() });
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  const byId = new Map(authList.map(a => [a.id, a]));
  const users = (profiles ?? []).map(p => ({
    ...p,
    email: byId.get(p.id)?.email ?? null,
    banned: byId.get(p.id)?.banned ?? false,
  }));
  return NextResponse.json({ users, serviceRole: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const action = validateAdminUserAction(body);
  if (!action) return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server — không thể thực hiện hành động này.' },
      { status: 503 },
    );
  }

  if (action.action === 'set_role') {
    const { error } = await admin.from('profiles').update({ role: action.role }).eq('id', action.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ban: khóa 100 năm (Supabase không có "vĩnh viễn", dùng thời hạn rất dài). unban: '0s'.
  const banDuration = action.action === 'ban' ? '876000h' : 'none';
  const { error } = await admin.auth.admin.updateUserById(action.userId, { ban_duration: banDuration });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
