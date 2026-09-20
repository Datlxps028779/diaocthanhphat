import { describe, expect, it } from 'vitest';
import type { Area } from './supabase';
import { areaSeoDraftFromArea, buildAreaPatch, emptyAreaSeoDraft, hasAreaChanges } from './adminAreaSeoDraft';

const area = {
  id: 'area-1',
  name: 'Bình Dương',
  slug: 'binh-duong',
  description: 'Mô tả cũ',
  image_url: null,
  order_index: 1,
  created_at: '2026-01-01T00:00:00Z',
  meta_title: 'Tiêu đề cũ',
  meta_description: null,
  focus_keywords: null,
  admin_note: 'Ghi chú cũ',
} as Area;

describe('draft khu vực — nạp dữ liệu', () => {
  it('nạp đủ 5 field, field null thành chuỗi rỗng để input không bị uncontrolled', () => {
    expect(areaSeoDraftFromArea(area)).toEqual({
      meta_title: 'Tiêu đề cũ',
      meta_description: '',
      focus_keywords: '',
      description: 'Mô tả cũ',
      admin_note: 'Ghi chú cũ',
    });
  });

  it('không có khu vực thì trả draft rỗng', () => {
    expect(areaSeoDraftFromArea(undefined)).toEqual(emptyAreaSeoDraft());
  });
});

describe('draft khu vực — partial patch chỉ field đã sửa', () => {
  it('không sửa gì thì patch rỗng và nút Lưu tắt được', () => {
    const draft = areaSeoDraftFromArea(area);
    expect(buildAreaPatch(area, draft)).toEqual({});
    expect(hasAreaChanges(area, draft)).toBe(false);
  });

  it('chỉ gửi description khi admin chỉ sửa description', () => {
    const draft = { ...areaSeoDraftFromArea(area), description: 'Mô tả mới' };
    expect(buildAreaPatch(area, draft)).toEqual({ description: 'Mô tả mới' });
  });

  it('chỉ gửi admin_note khi admin chỉ sửa admin_note', () => {
    const draft = { ...areaSeoDraftFromArea(area), admin_note: 'Ghi chú mới' };
    expect(buildAreaPatch(area, draft)).toEqual({ admin_note: 'Ghi chú mới' });
  });

  it('gửi nhiều field khi admin sửa nhiều field, không kéo field không đổi', () => {
    const draft = { ...areaSeoDraftFromArea(area), description: 'Mô tả mới', meta_title: 'Tiêu đề mới' };
    expect(buildAreaPatch(area, draft)).toEqual({ description: 'Mô tả mới', meta_title: 'Tiêu đề mới' });
  });

  it('xoá nội dung thì gửi null, không gửi chuỗi rỗng', () => {
    const draft = { ...areaSeoDraftFromArea(area), description: '   ', admin_note: '' };
    expect(buildAreaPatch(area, draft)).toEqual({ description: null, admin_note: null });
  });

  it('khoảng trắng thừa quanh giá trị không tạo patch giả', () => {
    const draft = { ...areaSeoDraftFromArea(area), description: '  Mô tả cũ  ' };
    expect(buildAreaPatch(area, draft)).toEqual({});
  });

  it('field null trong DB và chuỗi rỗng trong form coi là không đổi', () => {
    const draft = areaSeoDraftFromArea(area);
    expect(buildAreaPatch(area, draft).meta_description).toBeUndefined();
  });

  it('khu vực chưa có dữ liệu (undefined) thì không sinh patch', () => {
    expect(buildAreaPatch(undefined, { ...emptyAreaSeoDraft(), description: 'x' })).toEqual({});
  });

  it('không bao giờ đưa schema_markup vào patch', () => {
    const draft = { ...areaSeoDraftFromArea(area), description: 'Mô tả mới' };
    expect(Object.keys(buildAreaPatch(area, draft))).not.toContain('schema_markup');
  });
});
