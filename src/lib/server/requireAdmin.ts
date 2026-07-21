import { NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Xác thực caller là admin cho các API route server-side. Tách dùng chung để mọi
// route admin mới dùng chung một cơ chế (mirror app/api/admin/users/route.ts).
// Client gắn token của caller để kiểm danh tính + role qua RLS; service_role tạo
// riêng khi route cần bypass RLS.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function callerClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Client service_role — BỎ QUA RLS, chỉ tạo khi có key. null nếu chưa cấu hình.
export function adminClient(): SupabaseClient | null {
  if (!SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminAuthResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; status: number; msg: string };

// Trả token + userId nếu caller là admin, hoặc lỗi kèm HTTP status.
export async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return { ok: false, status: 401, msg: 'Chưa đăng nhập.' };
  const client = callerClient(token);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false, status: 401, msg: 'Phiên đăng nhập không hợp lệ.' };
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { ok: false, status: 403, msg: 'Tài khoản không có quyền quản trị.' };
  }
  return { ok: true, token, userId: user.id };
}
