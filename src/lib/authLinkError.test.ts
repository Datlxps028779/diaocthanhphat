import { describe, it, expect } from 'vitest';
import { friendlyAuthLinkError } from './authFlow';

describe('friendlyAuthLinkError', () => {
  it('code giả / PKCE mismatch → thông báo link hỏng, KHÔNG lộ chuỗi kỹ thuật', () => {
    const msg = friendlyAuthLinkError('invalid request: both auth code and code verifier should be non-empty');
    expect(msg).toBe('Liên kết không hợp lệ hoặc đã được sử dụng. Vui lòng thực hiện lại.');
    expect(msg).not.toMatch(/code verifier|invalid request/i);
  });

  it('link hết hạn (Email link is invalid or has expired) → báo hết hạn', () => {
    const msg = friendlyAuthLinkError('Email link is invalid or has expired');
    expect(msg).toBe('Liên kết đã hết hạn. Vui lòng yêu cầu gửi lại.');
  });

  it('OTP hết hạn (otp_expired / Token has expired) → báo hết hạn', () => {
    expect(friendlyAuthLinkError('otp_expired')).toBe('Liên kết đã hết hạn. Vui lòng yêu cầu gửi lại.');
    expect(friendlyAuthLinkError('Token has expired or is invalid')).toBe('Liên kết đã hết hạn. Vui lòng yêu cầu gửi lại.');
  });

  it('access_denied → báo link không hợp lệ', () => {
    expect(friendlyAuthLinkError('access_denied')).toBe('Liên kết không hợp lệ hoặc đã được sử dụng. Vui lòng thực hiện lại.');
  });

  it('thông điệp tiếng Việt tự đặt sẵn (đã thân thiện) → giữ nguyên', () => {
    const vn = 'Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu lần nữa.';
    expect(friendlyAuthLinkError(vn)).toBe(vn);
  });

  it('lỗi lạ không nhận diện → fallback chung, không lộ nội dung gốc', () => {
    const msg = friendlyAuthLinkError('WTF-500 kaboom internal xyz');
    expect(msg).toBe('Xác thực liên kết thất bại. Vui lòng thử lại.');
    expect(msg).not.toMatch(/kaboom|xyz/);
  });

  it('rỗng / undefined → fallback chung', () => {
    expect(friendlyAuthLinkError('')).toBe('Xác thực liên kết thất bại. Vui lòng thử lại.');
    expect(friendlyAuthLinkError(undefined)).toBe('Xác thực liên kết thất bại. Vui lòng thử lại.');
  });
});
