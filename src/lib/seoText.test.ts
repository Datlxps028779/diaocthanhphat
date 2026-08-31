import { describe, expect, it } from 'vitest';
import { clampSeoTitle } from './seoText';

describe('SEO title clamping', () => {
  it('cuts at a word boundary and reserves the ellipsis', () => {
    const title = clampSeoTitle('Bất động sản Quốc lộ 13: phân tích giá và cơ hội đầu tư mới nhất', 40);
    expect(title).toBe('Bất động sản Quốc lộ 13: phân tích giá…');
    expect([...title].length).toBeLessThanOrEqual(40);
  });

  it('does not split Unicode characters or alter short titles', () => {
    expect(clampSeoTitle('🔥 Nhà phố Dĩ An', 60)).toBe('🔥 Nhà phố Dĩ An');
    expect(clampSeoTitle('Một tiêu đề dài có từ rất dài', 8)).toBe('Một…');
  });
});
