import { describe, it, expect } from 'vitest';
import { buildPropertyFaq, suggestNewsFaq, buildFaqJsonLd, type FaqItem } from './propertyFaq';

describe('buildPropertyFaq — dùng "Bất động sản này" thay tiêu đề', () => {
  it('câu hỏi luôn dùng "Bất động sản này", không nhồi tiêu đề tin', () => {
    const items = buildPropertyFaq({
      title: 'Nhà phố mặt tiền Dĩ An',
      listing_type: 'mua_ban', price: 3, price_unit: 'tỷ',
      ward: 'Đông Hòa', district: 'Dĩ An', city: 'Bình Dương',
      area_sqm: 80, bedrooms: 3, legal_status: 'Sổ hồng', direction: 'Đông',
    });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.question).not.toContain('Nhà phố mặt tiền');
      expect(it.question).toContain('Bất động sản này');
    }
  });

  it('sinh đủ 5 nhóm khi đủ dữ liệu (giá/vị trí/diện tích/pháp lý/hướng)', () => {
    const items = buildPropertyFaq({
      listing_type: 'mua_ban', price: 3, price_unit: 'tỷ',
      district: 'Dĩ An', city: 'Bình Dương',
      area_sqm: 80, legal_status: 'Sổ hồng', direction: 'Đông',
    });
    expect(items).toHaveLength(5);
  });

  it('cho thuê → dùng giá/tháng', () => {
    const items = buildPropertyFaq({ listing_type: 'cho_thue', price_per_month: 10 });
    expect(items[0].answer).toContain('10 triệu/tháng');
    expect(items[0].question).toContain('cho thuê');
  });

  it('thiếu dữ liệu → bỏ câu, không bịa (trả [] khi rỗng hoàn toàn)', () => {
    expect(buildPropertyFaq({})).toEqual([]);
    const onlyPrice = buildPropertyFaq({ listing_type: 'mua_ban', price: 2, price_unit: 'tỷ' });
    expect(onlyPrice).toHaveLength(1);
  });

  it('chấp nhận số dạng chuỗi (form state)', () => {
    const items = buildPropertyFaq({ area_sqm: '80', bedrooms: '3' });
    expect(items[0].answer).toContain('80m²');
    expect(items[0].answer).toContain('3 phòng ngủ');
  });
});

describe('suggestNewsFaq — chỉ sinh câu hỏi, đáp để trống', () => {
  it('mọi item có answer rỗng để admin tự viết', () => {
    const items = suggestNewsFaq({ title: 'Giá đất Dĩ An', category: 'Thị trường', geoArea: 'Dĩ An' });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.answer).toBe('');
  });

  it('luôn có câu hỏi hành động dù thiếu hết input', () => {
    const items = suggestNewsFaq({});
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildFaqJsonLd', () => {
  it('rỗng/không phải mảng → null (không emit schema)', () => {
    expect(buildFaqJsonLd([])).toBeNull();
    expect(buildFaqJsonLd(null as unknown as FaqItem[])).toBeNull();
    expect(buildFaqJsonLd({} as unknown as FaqItem[])).toBeNull();
  });

  it('có FAQ → FAQPage với Question/Answer', () => {
    const ld = buildFaqJsonLd([{ question: 'Q1?', answer: 'A1.' }]);
    expect(ld).not.toBeNull();
    expect(ld!['@type']).toBe('FAQPage');
    const main = ld!.mainEntity as Array<Record<string, unknown>>;
    expect(main[0].name).toBe('Q1?');
    expect((main[0].acceptedAnswer as Record<string, unknown>).text).toBe('A1.');
  });
});
