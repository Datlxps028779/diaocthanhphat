import { describe, expect, it } from 'vitest';
import { normalizeSiteBrandText, SITE_IDENTITY } from './siteIdentity';

describe('site identity', () => {
  it('uses Chợ Nhà Việt as the canonical public brand', () => {
    expect(SITE_IDENTITY.name).toBe('Chợ Nhà Việt');
    expect(normalizeSiteBrandText('BĐS Bình Dương – Mua bán nhà đất')).toBe('Chợ Nhà Việt – Mua bán nhà đất');
  });

  it('does not rewrite ordinary geographic wording', () => {
    expect(normalizeSiteBrandText('Mua bán bất động sản Bình Dương')).toBe('Mua bán bất động sản Bình Dương');
  });
});
