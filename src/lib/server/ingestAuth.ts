import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// Xác thực caller máy-với-máy (make.com) bằng chuỗi bí mật tĩnh trong env. Khác
// requireAdmin: access_token của Supabase hết hạn ~1 giờ nên automation không dùng
// được, còn chuỗi tĩnh thì sống tới khi ta đổi env.
//
// So sánh bằng timingSafeEqual thay vì === : === thoát ngay ở byte đầu khác nhau
// nên thời gian phản hồi tiết lộ dần từng byte. Hash trước khi so để hai buffer
// luôn cùng độ dài (timingSafeEqual throw khi lệch, và bản thân độ dài cũng là
// thông tin không nên tiết lộ).

const MIN_SECRET_LENGTH = 20;

export type IngestAuthResult = { ok: true } | { ok: false; status: number; msg: string };

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function requireIngestAuth(req: NextRequest): IngestAuthResult {
  const expected = process.env.MAKE_API_KEY || '';

  // Chưa cấu hình → 503, KHÔNG phải 401. Nếu trả 401 thì lúc quên set env trên
  // Vercel ta sẽ tưởng make.com gửi sai và đi sửa nhầm chỗ.
  if (!expected) {
    return { ok: false, status: 503, msg: 'Chưa cấu hình MAKE_API_KEY trên server.' };
  }
  // Chuỗi quá ngắn thì brute-force được — chặn ngay ở cấu hình thay vì âm thầm cho qua.
  if (expected.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      status: 503,
      msg: `MAKE_API_KEY quá ngắn (cần tối thiểu ${MIN_SECRET_LENGTH} ký tự).`,
    };
  }

  const provided = req.headers.get('x-api-key') || '';
  if (!provided || !constantTimeEqual(provided, expected)) {
    return { ok: false, status: 401, msg: 'Xác thực không hợp lệ.' };
  }
  return { ok: true };
}

// Chủ sở hữu cho tin tạo qua API. user_listings.user_id là NOT NULL DEFAULT
// auth.uid(); client service_role không có auth.uid() nên default trả NULL và
// insert FAIL — buộc phải truyền tường minh.
//
// Ưu tiên MAKE_API_USER_ID nếu cấu hình; không thì lấy admin cũ nhất. Không tìm
// được thì trả null để route báo 503 — thà từ chối còn hơn insert lỗi khó hiểu.
export async function resolveIngestUserId(admin: SupabaseClient): Promise<string | null> {
  const configured = (process.env.MAKE_API_USER_ID || '').trim();
  if (configured) return configured;

  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}
