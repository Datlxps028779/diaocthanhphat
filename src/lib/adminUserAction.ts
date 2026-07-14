// Validator ở ranh giới API route admin. Body từ client KHÔNG tin được — chuẩn hoá
// về union rõ ràng hoặc trả null để route từ chối (400) trước khi chạm service_role
// (bỏ qua RLS). Chỉ nhận đúng action + tham số hợp lệ, không đoán.
export type AdminUserAction =
  | { action: 'set_role'; userId: string; role: 'user' | 'staff' | 'admin' }
  | { action: 'ban'; userId: string }
  | { action: 'unban'; userId: string }
  | { action: 'create_staff'; email: string; password: string; role: 'staff' | 'admin'; display_name: string | null };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// Email hợp lệ tối thiểu: có "@" và "." sau đó, không khoảng trắng. Đủ chặn rác;
// xác thực thật do Supabase Auth làm khi tạo user.
function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function validateAdminUserAction(body: unknown): AdminUserAction | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  // create_staff tạo tài khoản MỚI → không có userId; validate riêng.
  if (b.action === 'create_staff') {
    if (!isEmail(b.email)) return null;
    if (!isNonEmptyString(b.password) || b.password.length < 6) return null;
    if (b.role !== 'staff' && b.role !== 'admin') return null;   // tab NV không tạo role 'user'
    const display_name = isNonEmptyString(b.display_name) ? b.display_name.trim() : null;
    return { action: 'create_staff', email: (b.email as string).trim().toLowerCase(), password: b.password, role: b.role, display_name };
  }

  // Các action còn lại thao tác trên user có sẵn → bắt buộc userId.
  if (!isNonEmptyString(b.userId)) return null;

  if (b.action === 'set_role') {
    if (b.role === 'user' || b.role === 'staff' || b.role === 'admin') {
      return { action: 'set_role', userId: b.userId, role: b.role };
    }
    return null;
  }
  if (b.action === 'ban') return { action: 'ban', userId: b.userId };
  if (b.action === 'unban') return { action: 'unban', userId: b.userId };
  return null;
}
