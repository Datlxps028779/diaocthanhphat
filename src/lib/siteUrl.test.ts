import { describe, expect, it } from 'vitest';
import { normalizePublicHref } from './siteUrl';

describe('normalizePublicHref', () => {
  it('normalizes relative internal links to root paths', () => {
    expect(normalizePublicHref('ve-chung-toi')).toBe('/ve-chung-toi');
    expect(normalizePublicHref('/ve-chung-toi?from=footer#contact')).toBe('/ve-chung-toi?from=footer#contact');
  });

  it('keeps external web and contact links', () => {
    expect(normalizePublicHref('https://example.com/news')).toBe('https://example.com/news');
    expect(normalizePublicHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(normalizePublicHref('tel:+84123456789')).toBe('tel:+84123456789');
  });

  it('rejects unsafe schemes', () => {
    expect(normalizePublicHref('javascript:alert(1)')).toBe('');
    expect(normalizePublicHref('data:text/html,hello')).toBe('');
    expect(normalizePublicHref('blob:https://example.com/id')).toBe('');
  });
});
