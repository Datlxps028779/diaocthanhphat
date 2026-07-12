import { describe, it, expect } from 'vitest';
import { quickCategoryToPage } from './quickCategory';

describe('quickCategoryToPage — dựng Page listings từ cấu hình 1 ô danh mục nhanh', () => {
  it('ô chỉ lọc theo loại BĐS', () => {
    expect(quickCategoryToPage({ typeId: 'nha-o' }))
      .toEqual({ name: 'listings', typeId: 'nha-o' });
  });

  it('ô lọc loại + khu vực (VD: Nhà ở Thuận An)', () => {
    expect(quickCategoryToPage({ typeId: 'nha-o', district: 'Thuận An' }))
      .toEqual({ name: 'listings', typeId: 'nha-o', district: 'Thuận An' });
  });

  it('ô lọc đủ 3 cấp khu vực: tỉnh + quận/huyện + phường/xã', () => {
    expect(quickCategoryToPage({ areaId: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' }))
      .toEqual({ name: 'listings', areaId: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' });
  });

  it('ô lọc loại + pháp lý (VD: Đất sổ chung)', () => {
    expect(quickCategoryToPage({ typeId: 'dat-nen', legal: 'Sổ chung' }))
      .toEqual({ name: 'listings', typeId: 'dat-nen', legal: 'Sổ chung' });
  });

  it('mang listingType vào Page khi có cấu hình hình thức', () => {
    expect(quickCategoryToPage({ listingType: 'cho_thue', typeId: 'nha-o' }))
      .toEqual({ name: 'listings', listingType: 'cho_thue', typeId: 'nha-o' });
  });

  it('ô không cấu hình chiều nào → về danh sách tất cả (không kèm filter)', () => {
    expect(quickCategoryToPage({})).toEqual({ name: 'listings' });
  });

  it('bỏ qua chuỗi rỗng, không đưa khóa rỗng vào Page', () => {
    expect(quickCategoryToPage({ typeId: '', district: '', legal: 'Sổ hồng' }))
      .toEqual({ name: 'listings', legal: 'Sổ hồng' });
  });
});
