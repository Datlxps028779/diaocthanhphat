import { describe, expect, it } from 'vitest';
import { buildTruthfulHeroSubtitle } from './homeTruthfulCopy';

describe('truthful homepage copy', () => {
  it('replaces an unverified scale claim with the exact active count', () => {
    expect(buildTruthfulHeroSubtitle('Hơn 5.000 tin đăng nhà đất', 42)).toContain('42 tin đăng');
    expect(buildTruthfulHeroSubtitle('Hàng nghìn tin đăng', 42)).toContain('42 tin đăng');
  });

  it('uses a neutral fallback while the exact count is unavailable', () => {
    expect(buildTruthfulHeroSubtitle('Hơn 5.000 tin đăng nhà đất', null)).toBe('Tin đăng nhà đất, căn hộ, đất nền tại Bình Dương, Bình Phước, Đồng Nai');
  });

  it('preserves an ordinary CMS subtitle without an unverified scale claim', () => {
    expect(buildTruthfulHeroSubtitle('Tìm tin đăng phù hợp nhu cầu của bạn', 42)).toBe('Tìm tin đăng phù hợp nhu cầu của bạn');
  });
});
