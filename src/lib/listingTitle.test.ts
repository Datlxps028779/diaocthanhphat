import { describe, expect, it } from 'vitest';
import { normalizeListingTitle } from './listingTitle';

const normalize = (value: string, protectedPhrases: string[] = []) =>
  normalizeListingTitle(value, protectedPhrases).value;

describe('normalizeListingTitle', () => {
  it('chuyển CAPS LOCK và mixed caps về sentence case', () => {
    expect(normalize('BÁN NHÀ ĐẤT GIÁ TỐT')).toBe('Bán nhà đất giá tốt');
    expect(normalize('BÁN GẤP Lô ĐẤT MẶT TIỀN')).toBe('Bán gấp lô đất mặt tiền');
    expect(normalize('bán nhà chính chủ')).toBe('Bán nhà chính chủ');
  });

  it('viết hoa chữ cái đầu tiên sau số hoặc ký hiệu', () => {
    expect(normalize('2 LÔ ĐẤT LIỀN KỀ')).toBe('2 Lô đất liền kề');
    expect(normalize('*HÀNG HIẾM* ĐẤT GIÁ TỐT')).toBe('*Hàng hiếm* đất giá tốt');
  });

  it('chuẩn hóa khoảng trắng và dấu câu', () => {
    expect(normalize('  BÁN   NHÀ ,GIÁ TỐT/ BÌNH DƯƠNG  ', ['Bình Dương']))
      .toBe('Bán nhà, giá tốt / Bình Dương');
    expect(normalize('BÁN NHÀ,DĨ AN', ['Dĩ An'])).toBe('Bán nhà, Dĩ An');
    expect(normalize('BÁN DÃY TRỌ GIÁ 5, 5 TỶ')).toBe('Bán dãy trọ giá 5,5 tỷ');
    expect(normalize('BÁN NHÀ!!! GIÁ TỐT')).toBe('Bán nhà! giá tốt');
  });

  it('bảo toàn acronym, quốc lộ, token số và đơn vị', () => {
    expect(normalize('BÁN ĐẤT KCN KDC GẦN QL13 QL14 TP.HCM BĐS PCCC SHR 120m² 93m2 690TR'))
      .toBe('Bán đất KCN KDC gần QL13 QL14 TP.HCM BĐS PCCC SHR 120m² 93m2 690TR');
    expect(normalize('KCN MINH HƯNG GIÁ TỐT')).toBe('KCN Minh Hưng giá tốt');
  });

  it('bảo toàn địa danh động theo canonical casing', () => {
    expect(normalize('BÁN NHÀ DĨ AN BÌNH DƯƠNG', ['Dĩ An', 'Bình Dương']))
      .toBe('Bán nhà Dĩ An Bình Dương');
    expect(normalize('NHÀ MẶT TIỀN NGUYỄN VĂN LINH - LÊ PHONG'))
      .toBe('Nhà mặt tiền Nguyễn Văn Linh - Lê Phong');
    expect(normalize('NHÀ TP. HỒ CHÍ MINH', ['TP. Hồ Chí Minh']))
      .toBe('Nhà TP. Hồ Chí Minh');
  });

  it('sửa duy nhất các lỗi chính tả trong dictionary an toàn', () => {
    expect(normalize('BÁN NHÀ SỔ HONG CHÍNH CHŨ 3 PHÒNG NGŨ')).toBe('Bán nhà sổ hồng chính chủ 3 phòng ngủ');
    expect(normalize('MĂT TIỀN, THỔ CỬ')).toBe('Mặt tiền, thổ cư');
    expect(normalize('Tên dự ánn giữ nguyên')).toBe('Tên dự ánn giữ nguyên');
  });

  it('xử lý placeholder collision và phrase dài trước phrase ngắn', () => {
    expect(normalize(`BÁN NHÀ  DĨ AN BÌNH DƯƠNG`, ['Bình Dương', 'Dĩ An']))
      .toBe(`Bán nhà  Dĩ An Bình Dương`);
  });

  it('idempotent và trả metadata correction', () => {
    const first = normalizeListingTitle('  BÁN NHÀ KCN  ');
    const second = normalizeListingTitle(first.value);
    expect(first.value).toBe('Bán nhà KCN');
    expect(first.changed).toBe(true);
    expect(first.corrections.map(item => item.kind)).toContain('case');
    expect(second.value).toBe(first.value);
    expect(second.changed).toBe(false);
  });

  it('xử lý chuỗi rỗng', () => {
    expect(normalize('   ')).toBe('');
  });
});
