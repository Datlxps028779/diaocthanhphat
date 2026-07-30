import { describe, it, expect } from 'vitest';
import { buildProductPath, parseProductCode, PRODUCT_CODE_RE } from './productPath';

describe('buildProductPath', () => {
  const base = {
    id: 'uuid-1',
    slug: 'ban-nha-dep-an-phu',
    public_code: 1009,
    listing_type: 'mua_ban' as const,
    district: 'Dĩ An',
    areas: { slug: 'binh-duong' },
  };

  it('dựng path đầy đủ: lt + area + district + slug-pr{code}', () => {
    expect(buildProductPath(base)).toBe('/mua-ban/binh-duong/di-an/ban-nha-dep-an-phu-pr1009');
  });

  it('không có district → bỏ segment district', () => {
    expect(buildProductPath({ ...base, district: null }))
      .toBe('/mua-ban/binh-duong/ban-nha-dep-an-phu-pr1009');
  });

  it('cho_thue → path /cho-thue', () => {
    expect(buildProductPath({ ...base, listing_type: 'cho_thue' }))
      .toBe('/cho-thue/binh-duong/di-an/ban-nha-dep-an-phu-pr1009');
  });

  it('thiếu public_code → fallback URL cũ /bat-dong-san/{slug}', () => {
    expect(buildProductPath({ ...base, public_code: null }))
      .toBe('/bat-dong-san/ban-nha-dep-an-phu');
  });

  it('thiếu areas.slug → fallback URL cũ', () => {
    expect(buildProductPath({ ...base, areas: null }))
      .toBe('/bat-dong-san/ban-nha-dep-an-phu');
  });

  it('listing_type lạ → fallback URL cũ', () => {
    expect(buildProductPath({ ...base, listing_type: 'khac' }))
      .toBe('/bat-dong-san/ban-nha-dep-an-phu');
  });

  it('fallback dùng id khi cũng thiếu slug', () => {
    expect(buildProductPath({ id: 'uuid-1', public_code: null }))
      .toBe('/bat-dong-san/uuid-1');
  });

  it('district có dấu → slug bỏ dấu khớp districtDisplaySlug', () => {
    expect(buildProductPath({ ...base, district: 'Thủ Dầu Một' }))
      .toBe('/mua-ban/binh-duong/thu-dau-mot/ban-nha-dep-an-phu-pr1009');
  });

  it('giữ dấu gạch giữa từ khi district có nhiều từ (Hớn Quản → hon-quan)', () => {
    expect(buildProductPath({ ...base, district: 'Hớn Quản', areas: { slug: 'binh-phuoc' } }))
      .toBe('/mua-ban/binh-phuoc/hon-quan/ban-nha-dep-an-phu-pr1009');
  });
});

describe('parseProductCode', () => {
  it('bóc code + slug từ segment đuôi pr', () => {
    expect(parseProductCode('ban-nha-dep-an-phu-pr1009')).toEqual({ code: 1009, slug: 'ban-nha-dep-an-phu' });
  });

  it('segment không có đuôi pr → null (listing khu vực)', () => {
    expect(parseProductCode('di-an')).toBeNull();
    expect(parseProductCode('binh-duong')).toBeNull();
  });

  it('pr không kèm số → null', () => {
    expect(parseProductCode('ban-nha-pr')).toBeNull();
  });

  it('round-trip build → parse segment cuối khớp code', () => {
    const path = buildProductPath({
      id: 'x', slug: 'nha-pho', public_code: 1234,
      listing_type: 'mua_ban', district: 'Dĩ An', areas: { slug: 'binh-duong' },
    });
    const last = path.split('/').filter(Boolean).pop()!;
    expect(parseProductCode(last)).toEqual({ code: 1234, slug: 'nha-pho' });
  });

  it('PRODUCT_CODE_RE chỉ khớp ở cuối chuỗi', () => {
    expect(PRODUCT_CODE_RE.test('abc-pr12')).toBe(true);
    expect(PRODUCT_CODE_RE.test('pr12-abc')).toBe(false);
  });
});
