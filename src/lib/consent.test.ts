import { describe, it, expect } from 'vitest';
import { parseConsent, CONSENT_KEY, type ConsentStatus } from './consent';

describe('consent — trạng thái đồng ý cookie phân tích (GA4)', () => {
  it('parseConsent map giá trị đã lưu về đúng trạng thái', () => {
    expect(parseConsent('granted')).toBe('granted');
    expect(parseConsent('denied')).toBe('denied');
  });

  it('giá trị vắng/rỗng/rác → unset (chưa quyết định, phải hỏi)', () => {
    const cases: (string | null | undefined)[] = [null, undefined, '', 'yes', 'true', 'accepted'];
    cases.forEach(c => expect(parseConsent(c)).toBe('unset' as ConsentStatus));
  });

  it('CONSENT_KEY ổn định (đổi key = mất lịch sử đồng ý của user)', () => {
    expect(CONSENT_KEY).toBe('analytics_consent');
  });
});
