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

// Dịch lỗi xác thực link (xác nhận email / đặt lại mật khẩu) thành câu tiếng Việt
// thân thiện, KHÔNG lộ chuỗi kỹ thuật của Supabase (vd "both auth code and code
// verifier should be non-empty") ra người dùng. Thông điệp mình tự đặt (chứa "Vui
// lòng") được giữ nguyên để không dịch chồng.
const AUTH_LINK_EXPIRED = 'Liên kết đã hết hạn. Vui lòng yêu cầu gửi lại.';
const AUTH_LINK_INVALID = 'Liên kết không hợp lệ hoặc đã được sử dụng. Vui lòng thực hiện lại.';
const AUTH_LINK_FALLBACK = 'Xác thực liên kết thất bại. Vui lòng thử lại.';

export function friendlyAuthLinkError(raw: string | undefined | null): string {
  if (!raw) return AUTH_LINK_FALLBACK;
  if (raw.includes('Vui lòng')) return raw; // đã là thông điệp thân thiện của mình
  const s = raw.toLowerCase();
  if (s.includes('expired')) return AUTH_LINK_EXPIRED;
  if (s.includes('invalid') || s.includes('code verifier') || s.includes('access_denied')) {
    return AUTH_LINK_INVALID;
  }
  return AUTH_LINK_FALLBACK;
}

// Nhận diện lỗi đăng nhập khi tài khoản chưa xác nhận email (Supabase trả
// "Email not confirmed"). Tách riêng để UI hiện nút "Gửi lại email xác nhận".
export function isEmailNotConfirmedError(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return raw.toLowerCase().includes('email not confirmed');
}

export function friendlyIdentityConflictError(error: unknown): string | null {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const parts = [
    error instanceof Error ? error.message : typeof error === 'string' ? error : '',
    typeof record?.code === 'string' ? record.code : '',
    typeof record?.message === 'string' ? record.message : '',
    typeof record?.details === 'string' ? record.details : '',
    typeof record?.hint === 'string' ? record.hint : '',
  ];
  const text = parts.join(' ').toLowerCase();

  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'Email này đã được đăng ký. Vui lòng đăng nhập.';
  }
  if (text.includes('profiles_normalized_phone_unique') || (text.includes('23505') && text.includes('phone'))) {
    return 'Số điện thoại này đã được sử dụng cho một tài khoản khác.';
  }
  if (text.includes('database error saving new user')) {
    return 'Không thể tạo tài khoản. Email hoặc số điện thoại có thể đã được sử dụng.';
  }
  return null;
}
