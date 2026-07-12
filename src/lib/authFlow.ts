// Phân loại kết quả trả về từ supabase.auth.signUp thành 3 trạng thái rõ ràng cho UI.
// Điểm mấu chốt: khi Supabase bật "Email enumeration protection" (mặc định), đăng ký
// bằng email ĐÃ TỒN TẠI sẽ KHÔNG ném lỗi và KHÔNG gửi mail — mà trả về user với
// identities = [] (mảng rỗng). Đây là cách duy nhất phía client suy ra "email trùng".
// Nếu chỉ xét data.session null thì email trùng bị nhầm thành "cần xác nhận" → user
// ngồi chờ mail không bao giờ tới.
export type SignUpOutcome = 'logged_in' | 'needs_confirm' | 'already_registered';

type SignUpLike = {
  user?: { id?: string; identities?: unknown[] | null } | null;
  session?: unknown | null;
};

export function interpretSignUpResult(data: SignUpLike): SignUpOutcome {
  if (data.session) return 'logged_in';
  // identities là mảng rỗng ⇒ email đã đăng ký (không tạo identity mới). Chỉ kết luận
  // trùng khi CHẮC CHẮN có mảng và nó rỗng; thiếu/undefined thì không suy đoán.
  const identities = data.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) return 'already_registered';
  return 'needs_confirm';
}
