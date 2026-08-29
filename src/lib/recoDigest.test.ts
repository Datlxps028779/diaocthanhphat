import { describe, it, expect } from 'vitest';
import { buildProfileDigest } from './recoDigest';
import type { TasteProfile } from './taste';

const base: TasteProfile = {
  areaWeights: {}, typeWeights: {}, listingTypeWeights: {}, sampleSize: 0,
};

describe('buildProfileDigest', () => {
  it('map id→tên khu vực/loại, chỉ giữ id có nhãn, xếp theo trọng số giảm', () => {
    const profile: TasteProfile = {
      ...base,
      areaWeights: { a1: 5, a2: 9, a3: 1, aX: 3 },
      typeWeights: { t1: 2, t2: 8 },
      listingTypeWeights: {},
    };
    const d = buildProfileDigest(profile, {
      areas: { a1: 'Dĩ An', a2: 'Thuận An', a3: 'Thủ Dầu Một' }, // aX không có nhãn
      types: { t1: 'Nhà phố', t2: 'Đất nền' },
    });
    expect(d.areas).toEqual(['Thuận An', 'Dĩ An', 'Thủ Dầu Một']); // a2>a1>a3, aX bị loại
    expect(d.types).toEqual(['Đất nền', 'Nhà phố']); // t2>t1
  });

  it('giới hạn top 3 khu vực / 3 loại', () => {
    const profile: TasteProfile = {
      ...base,
      areaWeights: { a1: 1, a2: 2, a3: 3, a4: 4 },
    };
    const d = buildProfileDigest(profile, {
      areas: { a1: 'A', a2: 'B', a3: 'C', a4: 'D' },
    });
    expect(d.areas).toEqual(['D', 'C', 'B']); // top 3, bỏ a1
  });

  it('map đủ bốn hình thức sang nhãn tiếng Việt', () => {
    const profile: TasteProfile = {
      ...base,
      listingTypeWeights: { mua_ban: 4, cho_thue: 3, can_mua: 2, can_thue: 1 },
    };
    const d = buildProfileDigest(profile);
    expect(d.listingTypes).toEqual(['mua bán', 'cho thuê']);

    const demandProfile: TasteProfile = { ...base, listingTypeWeights: { can_thue: 3, can_mua: 2 } };
    expect(buildProfileDigest(demandProfile).listingTypes).toEqual(['cần thuê', 'cần mua']);
  });

  it('bỏ trọng số 0 và âm', () => {
    const profile: TasteProfile = { ...base, areaWeights: { a1: 0, a2: 5 } };
    const d = buildProfileDigest(profile, { areas: { a1: 'A', a2: 'B' } });
    expect(d.areas).toEqual(['B']);
  });

  it('không đưa giá chưa chuẩn hóa vào digest gửi AI', () => {
    const d = buildProfileDigest(base);
    expect(d).toEqual({ areas: [], types: [], listingTypes: [] });
    expect('priceMin' in d).toBe(false);
    expect('priceMax' in d).toBe(false);
  });
});
