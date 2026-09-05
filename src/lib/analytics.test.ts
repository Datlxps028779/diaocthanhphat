import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  track,
  sanitizeProps,
  sanitizeEventProps,
  EVENTS,
  EVENT_DIMENSIONS,
  EVENT_REQUIRED_DIMENSIONS,
  EVENT_FUNNEL_STAGE,
} from './analytics';

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

    it('loại khóa PII và giá trị nhận diện khỏi telemetry', () => {
      const out = sanitizeProps({
        phone: '0900000000',
        email: 'user@example.com',
        message: 'Tôi muốn xem nhà',
        rawUrl: 'https://example.com/danh-sach?phone=0900000000',
        safeFlag: true,
      });
      expect(out).toEqual({ safeFlag: true });
    });

    it('chỉ giữ dimension được phép theo từng event', () => {
      expect(sanitizeEventProps(EVENTS.LEAD_SUBMIT, {
        listingId: 'listing-1',
        source: 'contact_modal',
        hasMessage: true,
        position: 2,
        email: 'user@example.com',
      })).toEqual({
        listingId: 'listing-1',
        source: 'contact_modal',
        hasMessage: true,
      });
      expect(sanitizeEventProps(EVENTS.LEAD_SUBMIT, {
        source: 'Nguyễn Văn A',
        channel: 'https://example.com?phone=0900000000',
      })).toEqual({});
    });

  });

  describe('track — dispatch tới cả hai nhà cung cấp nếu có mặt', () => {
    beforeEach(() => {
      delete (globalThis as Record<string, unknown>).va;
      delete (globalThis as Record<string, unknown>).gtag;
      delete (globalThis as Record<string, unknown>).googleAnalyticsConsentGranted;
      delete (globalThis as Record<string, unknown>).googleAdsLeadConversion;
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
      (globalThis as Record<string, unknown>).googleAnalyticsConsentGranted = true;
      track('contact_open', { listingId: 'abc', bad: { x: 1 } });
      expect(gtag).toHaveBeenCalledWith('event', 'contact_open', { listingId: 'abc' });
    });

    it('gửi Google Ads conversion đúng một lần sau lead_submit', () => {
      const gtag = vi.fn();
      (globalThis as Record<string, unknown>).gtag = gtag;
      (globalThis as Record<string, unknown>).googleAnalyticsConsentGranted = true;
      (globalThis as Record<string, unknown>).googleAdsLeadConversion = 'AW-18379274535/4QdoCJrk_uAcEKfy9btE';
      track(EVENTS.LEAD_SUBMIT, { source: 'modal' });
      expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'lead_submit', { source: 'modal' });
      expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'conversion', { send_to: 'AW-18379274535/4QdoCJrk_uAcEKfy9btE' });
    });

    it('không gửi Google event khi chưa có consent', () => {
      const gtag = vi.fn();
      (globalThis as Record<string, unknown>).gtag = gtag;
      (globalThis as Record<string, unknown>).googleAdsLeadConversion = 'AW-18379274535/4QdoCJrk_uAcEKfy9btE';
      track(EVENTS.LEAD_SUBMIT, { source: 'modal' });
      expect(gtag).not.toHaveBeenCalled();
    });

    it('không ném lỗi khi cả hai provider vắng mặt (SSR / chưa consent)', () => {
      expect(() => track('search', { q: 'nhà' })).not.toThrow();
    });

    it('EVENTS chứa các tên chuẩn hoá dùng chung, không rỗng', () => {
      expect(EVENTS.LEAD_SUBMIT).toBe('lead_submit');
      expect(EVENTS.CONTACT_OPEN).toBe('contact_open');
      expect(EVENTS.AI_ADVISOR_OPEN).toBe('ai_advisor_open');
      expect(EVENTS.AI_ADVISOR_SEND).toBe('ai_advisor_send');
      expect(EVENTS.LISTING_VIEW).toBe('listing_view');
      expect(EVENTS.LISTING_SAVE).toBe('listing_save');
      expect(EVENTS.CONTENT_SHARE).toBe('content_share');
      expect(EVENTS.LISTING_RESULT_CLICK).toBe('listing_result_click');
      expect(EVENTS.AI_ADVISOR_SUGGEST).toBe('ai_advisor_suggest_properties');
      expect(EVENTS.AI_ADVISOR_PROPERTY_CLICK).toBe('ai_advisor_property_click');
      expect(EVENTS.DISCOVERY_MODULE_VIEW).toBe('discovery_module_view');
      expect(EVENTS.DISCOVERY_MODULE_CLICK).toBe('discovery_module_click');
      Object.values(EVENTS).forEach(v => expect(v.length).toBeGreaterThan(0));
    });
    it('khai báo đủ stage view → CTA → lead và allowlist dimension', () => {
      expect(EVENT_FUNNEL_STAGE[EVENTS.LISTING_VIEW]).toBe('view');
      expect(EVENT_FUNNEL_STAGE[EVENTS.CONTACT_OPEN]).toBe('cta');
      expect(EVENT_FUNNEL_STAGE[EVENTS.PHONE_REVEAL]).toBe('cta');
      expect(EVENT_FUNNEL_STAGE[EVENTS.LEAD_SUBMIT]).toBe('lead');
      Object.values(EVENTS).forEach(event => {
        expect(EVENT_DIMENSIONS[event]).toBeDefined();
      });
      expect(EVENT_REQUIRED_DIMENSIONS[EVENTS.LISTING_VIEW]).toEqual(['listingId', 'source']);
      expect(EVENT_REQUIRED_DIMENSIONS[EVENTS.LEAD_SUBMIT]).toEqual(['source']);
    });

    it('bỏ qua event không nằm trong contract ở runtime', () => {
      const va = vi.fn();
      (globalThis as Record<string, unknown>).va = va;
      track('unknown_event' as never, { source: 'test' });
      expect(va).not.toHaveBeenCalled();
    });
  });
});
