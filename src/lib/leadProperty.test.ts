import { describe, it, expect } from 'vitest';
import { priceText, propertySubtitle, filterProperties, type PropertyOption } from './leadProperty';

const mk = (o: Partial<PropertyOption> = {}): PropertyOption => ({
  id: 'p1', title: 'Nhà phố Dĩ An', price: 3.5, price_unit: 'tỷ',
  price_label: null, area_sqm: 80, ...o,
});

describe('priceText', () => {
  it('ưu tiên price_label khi có', () => {
    expect(priceText(mk({ price_label: 'Thỏa thuận' }))).toBe('Thỏa thuận');
  });
  it('ghép số + đơn vị khi không có label', () => {
    expect(priceText(mk({ price: 3.5, price_unit: 'tỷ' }))).toBe('3.5 tỷ');
  });
  it('rỗng khi giá <= 0 và không có label', () => {
    expect(priceText(mk({ price: 0, price_label: null }))).toBe('');
  });
  it('bỏ khoảng trắng thừa khi đơn vị rỗng', () => {
    expect(priceText(mk({ price: 5, price_unit: '', price_label: null }))).toBe('5');
  });
});

describe('propertySubtitle', () => {
  it('ghép giá · diện tích', () => {
    expect(propertySubtitle(mk({ price: 3.5, price_unit: 'tỷ', area_sqm: 80 }))).toBe('3.5 tỷ · 80 m²');
  });
  it('bỏ phần diện tích khi null/0', () => {
    expect(propertySubtitle(mk({ price: 3.5, price_unit: 'tỷ', area_sqm: null }))).toBe('3.5 tỷ');
    expect(propertySubtitle(mk({ price: 3.5, price_unit: 'tỷ', area_sqm: 0 }))).toBe('3.5 tỷ');
  });
  it('chỉ diện tích khi giá rỗng', () => {
    expect(propertySubtitle(mk({ price: 0, price_label: null, area_sqm: 80 }))).toBe('80 m²');
  });
  it('rỗng khi thiếu cả hai', () => {
    expect(propertySubtitle(mk({ price: 0, price_label: null, area_sqm: null }))).toBe('');
  });
});

describe('filterProperties', () => {
  const list = [mk({ id: '1', title: 'Nhà phố Dĩ An' }), mk({ id: '2', title: 'Căn hộ Thuận An' })];
  it('trả full khi keyword rỗng', () => {
    expect(filterProperties(list, '  ')).toHaveLength(2);
  });
  it('lọc không phân biệt hoa thường', () => {
    const r = filterProperties(list, 'DĨ AN');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('1');
  });
  it('trả rỗng khi không khớp', () => {
    expect(filterProperties(list, 'xyz')).toHaveLength(0);
  });
});
