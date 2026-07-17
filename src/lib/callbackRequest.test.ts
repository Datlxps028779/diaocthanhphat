import { describe, expect, it } from 'vitest';
import { callbackFollowUpAt, callbackTimeLabel } from './callbackRequest';

describe('callbackFollowUpAt', () => {
  it('đặt lịch gọi ngay và sau 30 phút từ mốc hiện tại', () => {
    const now = new Date(2026, 6, 17, 10, 0, 0, 0);
    expect(callbackFollowUpAt('asap', '', now)).toBe(now.toISOString());
    expect(callbackFollowUpAt('30m', '', now)).toBe(new Date(2026, 6, 17, 10, 30, 0, 0).toISOString());
  });

  it('đẩy mốc tối nay sang ngày kế tiếp nếu đã quá 19:00', () => {
    const got = new Date(callbackFollowUpAt('tonight', '', new Date(2026, 6, 17, 20, 0, 0, 0))!);
    expect(got.getFullYear()).toBe(2026);
    expect(got.getMonth()).toBe(6);
    expect(got.getDate()).toBe(18);
    expect(got.getHours()).toBe(19);
    expect(got.getMinutes()).toBe(0);
  });

  it('đặt sáng mai lúc 09:00 theo giờ địa phương', () => {
    const got = new Date(callbackFollowUpAt('tomorrow_morning', '', new Date(2026, 6, 17, 10, 0, 0, 0))!);
    expect(got.getDate()).toBe(18);
    expect(got.getHours()).toBe(9);
    expect(got.getMinutes()).toBe(0);
  });

  it('nhận custom datetime hợp lệ và bỏ qua custom rỗng/sai', () => {
    expect(callbackFollowUpAt('custom', '', new Date(2026, 6, 17))).toBeUndefined();
    expect(callbackFollowUpAt('custom', 'khong-hop-le', new Date(2026, 6, 17))).toBeUndefined();
    expect(new Date(callbackFollowUpAt('custom', '2026-07-18T14:30', new Date(2026, 6, 17))!).getHours()).toBe(14);
  });
});

describe('callbackTimeLabel', () => {
  it('hiển thị nhãn ngắn cho preset', () => {
    expect(callbackTimeLabel('asap', '')).toBe('Gọi ngay');
    expect(callbackTimeLabel('30m', '')).toBe('Trong 30 phút');
    expect(callbackTimeLabel('tonight', '')).toBe('Tối nay');
    expect(callbackTimeLabel('tomorrow_morning', '')).toBe('Sáng mai');
  });

  it('không crash khi custom time rỗng hoặc sai', () => {
    expect(callbackTimeLabel('custom', '')).toBe('Chọn giờ khác');
    expect(callbackTimeLabel('custom', 'khong-hop-le')).toBe('Chọn giờ khác');
  });
});
