import { describe, it, expect } from 'vitest';
import { leadOriginLabel, leadSourceLabel } from './leadSource';

describe('leadSourceLabel', () => {
  it('label các nguồn đã biết', () => {
    expect(leadSourceLabel('ai_advisor')).toBe('AI Advisor');
    expect(leadSourceLabel('valuation_page')).toBe('Trang định giá');
    expect(leadSourceLabel('admin_manual')).toBe('Nhập tay');
    expect(leadSourceLabel('property_detail_form')).toBe('Form chi tiết');
    expect(leadSourceLabel('property_callback')).toBe('Yêu cầu gọi lại');
  });

  it('fallback nguồn lạ/raw', () => {
    expect(leadSourceLabel('custom_source')).toBe('custom_source');
    expect(leadSourceLabel(null)).toBe('Không rõ');
  });
});

describe('leadOriginLabel', () => {
  it('origin labels cho timeline synthetic created', () => {
    expect(leadOriginLabel('ai_advisor')).toBe('Phát sinh từ AI Advisor');
    expect(leadOriginLabel('valuation_page')).toBe('Phát sinh từ trang định giá');
    expect(leadOriginLabel('admin_manual')).toBe('Phát sinh từ nhập tay');
    expect(leadOriginLabel('property_callback')).toBe('Phát sinh từ yêu cầu gọi lại trên trang chi tiết');
  });

  it('fallback khi rỗng/lạ', () => {
    expect(leadOriginLabel(null)).toBe('Phát sinh khách mới');
    expect(leadOriginLabel('zalo')).toBe('Phát sinh từ zalo');
  });
});
