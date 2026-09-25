import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/screens/RegionsPage.tsx'), 'utf8');

describe('regions selected-area actions', () => {
  it('links to the canonical deep locality page instead of duplicating consultation', () => {
    expect(source).toContain('Xem BĐS khu vực này');
    expect(source).toContain('Xem trang chuyên sâu');
    expect(source).toContain('href={`/khu-vuc/${selectedArea.slug}`}');
    expect(source).not.toContain('>Gọi tư vấn</a>');
  });

  it('separates sale and rental inventory into two columns', () => {
    expect(source).toContain("listingType: 'mua_ban'");
    expect(source).toContain("listingType: 'cho_thue'");
    expect(source).toContain('BĐS mua bán mới nhất tại');
    expect(source).toContain('BĐS cho thuê mới nhất tại');
  });
});
