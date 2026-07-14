// Validator ở ranh giới API route admin. Body từ client KHÔNG tin được — chuẩn hoá
// về union rõ ràng hoặc trả null để route từ chối (400) trước khi chạm service_role
// (bỏ qua RLS). Chỉ nhận đúng action + tham số hợp lệ, không đoán.
export type AdminUserAction =
  | { action: 'set_role'; userId: string; role: 'user' | 'staff' | 'admin' }
  | { action: 'ban'; userId: string }
  | { action: 'unban'; userId: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function validateAdminUserAction(body: unknown): AdminUserAction | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
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
