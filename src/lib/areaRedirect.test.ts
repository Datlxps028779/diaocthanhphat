import { describe, expect, it } from 'vitest';
import { buildLegacyAreaRedirectPath } from './areaRedirect';

const taxonomy = {
  area: { id: 'bd', slug: 'binh-duong' },
  districts: [{ area_id: 'bd', name: 'Dĩ An', slug: 'binh-duong-di-an' }],
};

describe('buildLegacyAreaRedirectPath', () => {
  it('redirect area UUID query sang path area và giữ filter phụ', () => {
    const out = buildLegacyAreaRedirectPath('/cho-thue', new URLSearchParams('area=bd&type=t1&bedrooms=2'), taxonomy);
    expect(out).toBe('/cho-thue/binh-duong?type=t1&bedrooms=2');
  });

  it('đưa district lên path, bỏ district khỏi query và strip tiền tố tỉnh', () => {
    const out = buildLegacyAreaRedirectPath('/mua-ban', new URLSearchParams('area=bd&district=Dĩ An&ward=Tân Đông Hiệp'), taxonomy);
    expect(out).toBe('/mua-ban/binh-duong/di-an?ward=T%C3%A2n+%C4%90%C3%B4ng+Hi%E1%BB%87p');
  });

  it('giữ district trong query nếu không map được', () => {
    const out = buildLegacyAreaRedirectPath('/cho-thue', new URLSearchParams('area=bd&district=Không Tồn Tại'), taxonomy);
    expect(out).toBe('/cho-thue/binh-duong?district=Kh%C3%B4ng+T%E1%BB%93n+T%E1%BA%A1i');
  });

  it('không redirect path ngoài listing hoặc area không resolve', () => {
    expect(buildLegacyAreaRedirectPath('/danh-sach', new URLSearchParams('area=bd'), taxonomy)).toBeNull();
    expect(buildLegacyAreaRedirectPath('/cho-thue', new URLSearchParams('area=bd'), { area: null, districts: [] })).toBeNull();
  });
});
