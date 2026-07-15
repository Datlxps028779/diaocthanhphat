import { describe, it, expect } from 'vitest';
import { computeExpiresAt, daysUntilExpiry, isExpired, expiryLabel, resolveApprovalExpiresAt, EXPIRY_DAYS } from './listingExpiry';

describe('listingExpiry — tính hạn hiển thị tin đăng', () => {
  const T0 = '2026-01-01T00:00:00.000Z';

  describe('computeExpiresAt', () => {
    it('mặc định cộng 60 ngày kể từ mốc duyệt', () => {
      expect(computeExpiresAt(T0)).toBe('2026-03-02T00:00:00.000Z'); // +60 ngày
      expect(EXPIRY_DAYS).toBe(60);
    });
    it('nhận số ngày tùy chỉnh (admin đặt riêng)', () => {
      expect(computeExpiresAt(T0, 30)).toBe('2026-01-31T00:00:00.000Z');
      expect(computeExpiresAt(T0, 1)).toBe('2026-01-02T00:00:00.000Z');
    });
  });

  describe('resolveApprovalExpiresAt', () => {
    it('tạo hạn mới khi tin chưa có hạn', () => {
      expect(resolveApprovalExpiresAt(null, T0)).toBe('2026-03-02T00:00:00.000Z');
    });

    it('tạo hạn mới khi hạn cũ đã qua', () => {
      expect(resolveApprovalExpiresAt('2025-12-31T00:00:00.000Z', T0)).toBe('2026-03-02T00:00:00.000Z');
    });

    it('giữ hạn custom trong tương lai do admin đặt', () => {
      expect(resolveApprovalExpiresAt('2026-04-01T00:00:00.000Z', T0)).toBe('2026-04-01T00:00:00.000Z');
    });
  });

  describe('daysUntilExpiry', () => {
    it('null khi không có hạn', () => {
      expect(daysUntilExpiry(null)).toBeNull();
      expect(daysUntilExpiry(undefined)).toBeNull();
    });
    it('đếm ngày còn lại, làm tròn lên', () => {
      expect(daysUntilExpiry('2026-01-11T00:00:00.000Z', T0)).toBe(10);
      // còn hơn 4 ngày một chút → làm tròn lên 5
      expect(daysUntilExpiry('2026-01-05T06:00:00.000Z', T0)).toBe(5);
    });
    it('âm khi đã quá hạn', () => {
      expect(daysUntilExpiry('2025-12-30T00:00:00.000Z', T0)).toBe(-2);
    });
  });

  describe('isExpired', () => {
    it('false khi không có hạn', () => {
      expect(isExpired(null, T0)).toBe(false);
    });
    it('false khi còn hạn, true khi tới/qua hạn', () => {
      expect(isExpired('2026-01-02T00:00:00.000Z', T0)).toBe(false);
      expect(isExpired('2026-01-01T00:00:00.000Z', T0)).toBe(true); // đúng mốc
      expect(isExpired('2025-12-31T00:00:00.000Z', T0)).toBe(true);
    });
  });

  describe('expiryLabel', () => {
    it('null khi không có hạn', () => {
      expect(expiryLabel(null, T0)).toBeNull();
    });
    it('nhãn theo số ngày còn lại', () => {
      expect(expiryLabel('2026-01-11T00:00:00.000Z', T0)).toBe('Còn 10 ngày');
      expect(expiryLabel('2026-01-02T00:00:00.000Z', T0)).toBe('Còn 1 ngày');
      expect(expiryLabel('2026-01-01T00:00:00.000Z', T0)).toBe('Đã hết hạn');
      expect(expiryLabel('2025-12-20T00:00:00.000Z', T0)).toBe('Đã hết hạn');
    });
  });
});
