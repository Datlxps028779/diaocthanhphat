import { describe, it, expect } from 'vitest';
import { autofillNewsFaq, autofillNewsGeo } from './newsAutofill';

const HTML = [
  '<p>Thị trường bất động sản Dĩ An, Bình Dương đang phục hồi nhờ hạ tầng. Nhu cầu ở thực tăng rõ.</p>',
  '<p>Tuyến Vành đai 3 và khu công nghiệp VSIP tạo lực đẩy cho khu vực Dĩ An.</p>',
  '<p>Nhà đầu tư cần lưu ý pháp lý và quy hoạch trước khi xuống tiền. Tránh tin đồn quy hoạch.</p>',
  '<p>Người mua nên so sánh nhiều dự án và kiểm tra pháp lý kỹ trước khi quyết định.</p>',
].join('');

describe('autofillNewsFaq', () => {
  it('sinh FAQ có cả câu hỏi lẫn trả lời từ nội dung', () => {
    const faq = autofillNewsFaq(HTML, { title: 'Giá đất Dĩ An', category: 'Thị trường', geoArea: 'Dĩ An, Bình Dương' });
    expect(faq.length).toBeGreaterThanOrEqual(2);
    expect(faq.every(f => f.question && f.answer)).toBe(true);
  });

  it('trả rỗng khi chưa có nội dung', () => {
    expect(autofillNewsFaq('', { title: 'x' })).toEqual([]);
  });

  it('không trùng câu hỏi', () => {
    const faq = autofillNewsFaq(HTML, { title: 'T', category: 'Thị trường', geoArea: 'Dĩ An' });
    const qs = faq.map(f => f.question);
    expect(new Set(qs).size).toBe(qs.length);
  });
});

describe('autofillNewsGeo', () => {
  it('trích khu vực + entity + ghi chú từ nội dung', () => {
    const geo = autofillNewsGeo(HTML, 'Giá đất Dĩ An 2026');
    expect(geo.geoArea).toContain('Dĩ An');
    expect(geo.geoArea).toContain('Bình Dương');
    expect(geo.geoEntity).toMatch(/Vành đai 3|VSIP/i);
    expect(geo.geoNotes).toContain('Liên quan');
  });

  it('field rỗng khi không tìm thấy', () => {
    const geo = autofillNewsGeo('<p>Một đoạn văn không có địa danh cụ thể.</p>', '');
    expect(geo.geoArea).toBe('');
    expect(geo.geoEntity).toBe('');
  });
});
