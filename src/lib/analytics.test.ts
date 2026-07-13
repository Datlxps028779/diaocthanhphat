import { describe, it, expect, beforeEach, vi } from 'vitest';
import { track, sanitizeProps, EVENTS } from './analytics';

describe('analytics — facade gửi event tới Vercel + GA4', () => {
  describe('sanitizeProps — chỉ giữ giá trị Vercel Analytics chấp nhận', () => {
    it('giữ string/number/boolean, bỏ undefined và object/array lồng nhau', () => {
      const out = sanitizeProps({
        a: 'x', b: 3, c: true, d: undefined, e: { nested: 1 }, f: [1, 2], g: 0, h: false,
      });
      expect(out).toEqual({ a: 'x', b: 3, c: true, g: 0, h: false });
    });

    it('bỏ null (Vercel không cho null trong custom event) và NaN', () => {
      const out = sanitizeProps({ a: null, b: NaN, c: 'ok' });
      expect(out).toEqual({ c: 'ok' });
    });

    it('cắt chuỗi quá dài về tối đa 255 ký tự', () => {
      const long = 'y'.repeat(300);
      const out = sanitizeProps({ title: long });
      expect((out.title as string).length).toBe(255);
    });

    it('trả object rỗng khi không có props', () => {
      expect(sanitizeProps()).toEqual({});
      expect(sanitizeProps(undefined)).toEqual({});
    });
  });

  describe('track — dispatch tới cả hai nhà cung cấp nếu có mặt', () => {
    beforeEach(() => {
      delete (globalThis as Record<string, unknown>).va;
      delete (globalThis as Record<string, unknown>).gtag;
    });

    it('gọi window.va với dạng ("event", {name, ...props}) đã sanitize', () => {
      const va = vi.fn();
      (globalThis as Record<string, unknown>).va = va;
      track('lead_submit', { source: 'modal', junk: undefined });
      expect(va).toHaveBeenCalledWith('event', { name: 'lead_submit', source: 'modal' });
    });

    it('gọi window.gtag với dạng ("event", name, props) đã sanitize', () => {
      const gtag = vi.fn();
      (globalThis as Record<string, unknown>).gtag = gtag;
      track('contact_open', { listingId: 'abc', bad: { x: 1 } });
      expect(gtag).toHaveBeenCalledWith('event', 'contact_open', { listingId: 'abc' });
    });

    it('không ném lỗi khi cả hai provider vắng mặt (SSR / chưa consent)', () => {
      expect(() => track('search', { q: 'nhà' })).not.toThrow();
    });

    it('EVENTS chứa các tên chuẩn hoá dùng chung, không rỗng', () => {
      expect(EVENTS.LEAD_SUBMIT).toBe('lead_submit');
      expect(EVENTS.CONTACT_OPEN).toBe('contact_open');
      Object.values(EVENTS).forEach(v => expect(v.length).toBeGreaterThan(0));
    });
  });
});
