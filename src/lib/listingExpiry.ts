// Tính hạn hiển thị tin đăng. Tách seam thuần (không đụng Date.now bên trong) để
// test được: mọi hàm nhận `now` dạng ISO string, mặc định lấy thời điểm hiện tại.
// Tin quá hạn → cron chuyển status='expired' → trigger ẩn properties (xem migration
// 20260712050000). UI dùng các hàm này để hiện badge + đếm ngày còn lại.

// Mặc định 60 ngày kể từ lúc admin duyệt. Admin có thể đặt ngày khác cho từng tin.
export const EXPIRY_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// Ngày hết hạn = mốc `fromISO` + `days` ngày. Trả ISO string để lưu thẳng vào DB.
export function computeExpiresAt(fromISO: string, days = EXPIRY_DAYS): string {
  return new Date(new Date(fromISO).getTime() + days * DAY_MS).toISOString();
}

// Số ngày còn lại tới hạn (làm tròn lên). null nếu tin không có hạn.
// Âm hoặc 0 nghĩa là đã tới/qua hạn.
export function daysUntilExpiry(expiresAtISO: string | null | undefined, nowISO?: string): number | null {
  if (!expiresAtISO) return null;
  const now = nowISO ? new Date(nowISO).getTime() : Date.now();
  return Math.ceil((new Date(expiresAtISO).getTime() - now) / DAY_MS);
}

// Đã quá hạn hiển thị? (có expires_at và mốc đó <= hiện tại)
export function isExpired(expiresAtISO: string | null | undefined, nowISO?: string): boolean {
  if (!expiresAtISO) return false;
  const now = nowISO ? new Date(nowISO).getTime() : Date.now();
  return new Date(expiresAtISO).getTime() <= now;
}

// Nhãn ngắn cho UI. Trả null nếu không có hạn (để UI bỏ qua).
export function expiryLabel(expiresAtISO: string | null | undefined, nowISO?: string): string | null {
  const d = daysUntilExpiry(expiresAtISO, nowISO);
  if (d == null) return null;
  if (d <= 0) return 'Đã hết hạn';
  if (d === 1) return 'Còn 1 ngày';
  return `Còn ${d} ngày`;
}
