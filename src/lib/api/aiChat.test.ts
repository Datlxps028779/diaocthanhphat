import { describe, expect, it } from 'vitest';
import { isSafeCitationUrl } from './aiChat';

describe('isSafeCitationUrl', () => {
  it('accepts HTTP(S) URLs with normal URL components', () => {
    expect(isSafeCitationUrl('https://example.gov.vn:8443/data?year=2026#latest')).toBe(true);
    expect(isSafeCitationUrl('http://example.com/source')).toBe(true);
  });

  it('rejects executable, non-web, malformed, and empty URLs', () => {
    expect(isSafeCitationUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeCitationUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeCitationUrl('mailto:editor@example.com')).toBe(false);
    expect(isSafeCitationUrl('not-a-url')).toBe(false);
    expect(isSafeCitationUrl('')).toBe(false);
    expect(isSafeCitationUrl(null)).toBe(false);
  });
});
