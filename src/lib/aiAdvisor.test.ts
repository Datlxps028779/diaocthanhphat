import { describe, it, expect } from 'vitest';
import type { Area, District, Property, PropertyType, Ward } from './supabase';
import {
  buildAdvisorTurn,
  buildAdvisorLeadPayload,
  formatAdvisorBudget,
  isSensitiveAdviceRequest,
  matchKnowledge,
  safeAdviceResponse,
  summarizeAdvisorNeed,
  summarizePropertyForAdvisor,
  validateAdvisorLeadContact,
} from './aiAdvisor';
import type { AiChatKnowledge } from './supabase';

const areas: Area[] = [{ id: 'area-bd', name: 'Bình Dương', slug: 'binh-duong', description: null, image_url: null, order_index: 1, created_at: '2026-01-01' }];
const districts: District[] = [
  { id: 'd-di-an', area_id: 'area-bd', name: 'Dĩ An', slug: 'di-an', order_index: 1, created_at: '2026-01-01' },
  { id: 'd-tdm', area_id: 'area-bd', name: 'Thủ Dầu Một', slug: 'thu-dau-mot', order_index: 2, created_at: '2026-01-01' },
];
const wards: Ward[] = [];
const propertyTypes: PropertyType[] = [
  { id: 'type-can-ho', name: 'Căn hộ', slug: 'can-ho', icon: null, created_at: '2026-01-01' },
  { id: 'type-nha-pho', name: 'Nhà phố', slug: 'nha-pho', icon: null, created_at: '2026-01-01' },
];
const taxonomy = { areas, districts, wards, propertyTypes };

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', title: 'Nhà phố Dĩ An', description: null,
    price: 2.8, price_unit: 'tỷ', price_label: null, price_per_month: null, loan_support: null,
    listing_type: 'mua_ban', area_sqm: 80, address: null, city: 'Bình Dương', district: 'Dĩ An', ward: null,
    area_id: 'area-bd', district_id: null, property_type_id: 'type-nha-pho',
    image_url: 'https://x/a.jpg', images: null, badge: null, badge_color: null, legal_status: 'Sổ hồng',
    is_featured: false, is_hot: false, is_active: true, is_verified: false, views: 0,
    contact_name: null, contact_phone: null, bedrooms: 3, bathrooms: null, floor_count: null, floor_number: null,
    direction: null, road_width: null, frontage: null, amenities: null, latitude: null, longitude: null,
    formatted_address: null, vr_tour_url: null, video_url: null, contact_zalo: null, tags: null,
    meta_title: null, meta_description: null, focus_keywords: null, schema_markup: null, faq: null,
    slug: 'nha-pho-di-an', created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('buildAdvisorTurn', () => {
  it('hiểu nhu cầu mua nhà và trả filters + reply tóm tắt', () => {
    const turn = buildAdvisorTurn('nhà Dĩ An dưới 3 tỷ sổ hồng', taxonomy);
    expect(turn.stage).toBe('showing_matches');
    expect(turn.filters.district).toBe('Dĩ An');
    expect(turn.filters.maxPrice).toBe(3);
    expect(turn.filters.legal).toBe('Sổ hồng');
    expect(turn.reply).toContain('Dĩ An');
    expect(turn.reply).toContain('Sổ hồng');
  });

  it('input low-confidence thì hỏi thêm, không fake filters', () => {
    const turn = buildAdvisorTurn('tư vấn giúp tôi', taxonomy);
    expect(turn.stage).toBe('collecting_need');
    expect(turn.filters.district).toBeUndefined();
    expect(turn.reply).toContain('khu vực');
  });

  it('prompt pháp lý trả lời an toàn, không khẳng định hồ sơ', () => {
    const turn = buildAdvisorTurn('sổ chung có nên mua không', taxonomy);
    expect(turn.stage).toBe('collecting_contact');
    expect(turn.safetyNote).toContain('tham khảo');
    expect(turn.reply).toContain('hồ sơ gốc');
  });

  it('prompt vay/lãi suất không bịa lãi suất', () => {
    const turn = buildAdvisorTurn('vay ngân hàng lãi suất bao nhiêu', taxonomy);
    expect(turn.stage).toBe('collecting_contact');
    expect(turn.reply).toContain('ngân hàng');
    expect(turn.reply).not.toMatch(/\d+%/);
  });
});

describe('advisor helpers', () => {
  it('formatAdvisorBudget format giá', () => {
    expect(formatAdvisorBudget({ maxPrice: 3 })).toBe('Dưới 3 tỷ');
    expect(formatAdvisorBudget({ minPrice: 5, maxPrice: 10, listingType: 'cho_thue' })).toBe('5–10 triệu/tháng');
  });

  it('summarizeAdvisorNeed tạo tóm tắt không rỗng', () => {
    const turn = buildAdvisorTurn('cho thuê căn hộ Thủ Dầu Một 5-10 triệu', taxonomy);
    expect(summarizeAdvisorNeed(turn)).toContain('Thủ Dầu Một');
    expect(summarizeAdvisorNeed(turn)).toContain('5–10 triệu/tháng');
  });

  it('summarizePropertyForAdvisor convert property sang card summary', () => {
    const summary = summarizePropertyForAdvisor(property());
    expect(summary.title).toBe('Nhà phố Dĩ An');
    expect(summary.priceText).toBe('2.8 tỷ');
    expect(summary.location).toContain('Dĩ An');
  });

  it('detect sensitive requests + safe responses', () => {
    expect(isSensitiveAdviceRequest('lãi suất vay')).toBe('loan');
    expect(isSensitiveAdviceRequest('pháp lý sổ chung')).toBe('legal');
    expect(isSensitiveAdviceRequest('đầu tư lợi nhuận')).toBe('investment');
    expect(isSensitiveAdviceRequest('chỉ số ROI kỳ vọng')).toBe('investment');
    // "rồi" normalize thành "roi" — không được nuốt thành câu đầu tư
    expect(isSensitiveAdviceRequest('nhà Dĩ An dưới 3 tỷ sổ hồng rồi')).toBeNull();
    expect(safeAdviceResponse('legal')).toContain('tham khảo');
  });

  it('validateAdvisorLeadContact yêu cầu tên và phone hợp lệ', () => {
    expect(validateAdvisorLeadContact({ full_name: '', phone: '0901234567' }).valid).toBe(false);
    expect(validateAdvisorLeadContact({ full_name: 'Anh Minh', phone: '123' }).valid).toBe(false);
    expect(validateAdvisorLeadContact({ full_name: 'Anh Minh', phone: '0901 234 567' }).valid).toBe(true);
  });

  it('buildAdvisorLeadPayload chỉ tạo fields public-safe', () => {
    const turn = buildAdvisorTurn('nhà Dĩ An dưới 3 tỷ sổ hồng', taxonomy);
    const payload = buildAdvisorLeadPayload({ full_name: 'Anh Minh', phone: '0901234567' }, turn, property());
    expect(payload.source).toBe('ai_advisor');
    expect(payload.property_id).toBe('p1');
    expect(payload.property_title).toBe('Nhà phố Dĩ An');
    expect(payload.message).toContain('Nhu cầu từ AI Advisor');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('note');
    expect(payload).not.toHaveProperty('follow_up_at');
  });

  it('lead từ câu hỏi nhạy cảm giữ lại nhu cầu gốc cho tư vấn viên', () => {
    const turn = buildAdvisorTurn('Tôi cần tư vấn pháp lý', taxonomy);
    const payload = buildAdvisorLeadPayload({ full_name: 'Anh Minh', phone: '0901234567' }, turn);
    expect(payload.area_interest).toBe('Tôi cần tư vấn pháp lý');
    expect(payload.message).toContain('Tôi cần tư vấn pháp lý');
  });
});

const kbEntries: AiChatKnowledge[] = [
  { id: 'kb-loan', topic: 'Vay ngân hàng', keywords: 'vay, vay ngân hàng, trả góp', answer: 'Bên em hỗ trợ vay tới 70% qua ngân hàng liên kết.', priority: 10, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'kb-fee', topic: 'Phí môi giới', keywords: 'phí, phí môi giới, hoa hồng', answer: 'Người mua xem tin và liên hệ tư vấn viên hoàn toàn miễn phí.', priority: 5, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'kb-off', topic: 'Câu tắt', keywords: 'khuyến mãi', answer: 'Câu này đang tắt, không được khớp.', priority: 99, is_active: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
];

describe('buildAdvisorTurn — fix bug ưu tiên câu nhạy cảm', () => {
  it('"mua nhà 2 tỷ có vay ngân hàng" vẫn tìm tin ≤2 tỷ + ghép lưu ý vay', () => {
    const turn = buildAdvisorTurn('mua nhà 2 tỷ có vay ngân hàng', taxonomy);
    expect(turn.stage).toBe('showing_matches');
    expect(turn.filters.listingType).toBe('mua_ban');
    expect(turn.filters.maxPrice).toBe(2);
    expect(turn.safetyNote).toBeDefined();
    expect(turn.reply).toContain('ngân hàng');
  });

  it('câu hỏi tư vấn thuần "sổ chung có nên mua không" vẫn đi nhánh nhạy cảm', () => {
    const turn = buildAdvisorTurn('sổ chung có nên mua không', taxonomy);
    expect(turn.stage).toBe('collecting_contact');
    expect(turn.reply).toContain('hồ sơ gốc');
  });

  it('không truyền opts → hành vi cũ giữ nguyên (câu nhạy cảm thuần)', () => {
    const turn = buildAdvisorTurn('vay ngân hàng lãi suất bao nhiêu', taxonomy);
    expect(turn.stage).toBe('collecting_contact');
    expect(turn.reply).not.toMatch(/\d+%/);
  });
});

describe('matchKnowledge', () => {
  it('khớp theo keyword, ưu tiên priority cao trước', () => {
    const hit = matchKnowledge('cho hỏi phí môi giới thế nào', kbEntries);
    expect(hit?.id).toBe('kb-fee');
  });

  it('không phân biệt hoa/dấu', () => {
    const hit = matchKnowledge('VAY NGÂN HÀNG được không', kbEntries);
    expect(hit?.id).toBe('kb-loan');
  });

  it('bỏ qua entry inactive dù priority cao', () => {
    const hit = matchKnowledge('có khuyến mãi gì không', kbEntries);
    expect(hit).toBeNull();
  });

  it('không có entries → null', () => {
    expect(matchKnowledge('vay ngân hàng', [])).toBeNull();
    expect(matchKnowledge('vay ngân hàng', undefined)).toBeNull();
  });
});

describe('KB + lời mặc định override', () => {
  it('KB khớp ở câu tư vấn thuần → trả answer admin soạn', () => {
    const turn = buildAdvisorTurn('cho hỏi phí môi giới', taxonomy, { knowledge: kbEntries });
    expect(turn.stage).toBe('collecting_contact');
    expect(turn.reply).toContain('miễn phí');
  });

  it('lời mặc định admin override câu nhạy cảm mặc định', () => {
    const turn = buildAdvisorTurn('vay ngân hàng lãi suất bao nhiêu', taxonomy, {
      messages: { loan: 'Câu vay do admin soạn riêng.' },
    });
    expect(turn.stage).toBe('collecting_contact');
    expect(turn.reply).toBe('Câu vay do admin soạn riêng.');
  });

  it('safeAdviceResponse nhận override', () => {
    expect(safeAdviceResponse('loan', 'Nội dung admin')).toBe('Nội dung admin');
    expect(safeAdviceResponse('loan', '  ')).toContain('ngân hàng');
  });
});
