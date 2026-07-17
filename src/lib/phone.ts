// Validate + chuẩn hoá số điện thoại di động Việt Nam (thuần, test được).
// Chấp nhận người dùng nhập có khoảng trắng/dấu chấm/gạch, tiền tố +84 hoặc 84.
// Đầu số di động VN hợp lệ: 03, 05, 07, 08, 09 → tổng 10 chữ số dạng 0xxxxxxxxx.

const VN_MOBILE_RE = /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/;

// Bỏ mọi ký tự không phải chữ số, quy +84/84 về 0. Trả chuỗi 10 số nếu dựng được,
// ngược lại trả chuỗi đã lọc số để caller tự xử lý.
export function normalizeVnPhone(input: string): string {
  const digits = (input ?? '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) return '0' + digits.slice(2);
  return digits;
}

export function isValidVnPhone(input: string): boolean {
  return VN_MOBILE_RE.test(normalizeVnPhone(input));
}
