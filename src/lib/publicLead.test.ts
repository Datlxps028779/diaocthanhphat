import { describe, expect, it } from 'vitest';
import { parsePublicLeadPayload } from './publicLead';

describe('parsePublicLeadPayload', () => {
  it('chuẩn hóa dữ liệu form và số điện thoại', () => {
    const result = parsePublicLeadPayload({
      full_name: '  Nguyễn Văn A  ',
      phone: ' +84 901 234 567 ',
      property_id: '11111111-1111-4111-8111-111111111111',
      property_title: 'Nhà phố',
      source: 'property_detail_form',
      message: '  Xin tư vấn  ',
    }, '22222222-2222-4222-8222-222222222222');

    expect(result).toMatchObject({
      ok: true,
      insert: {
        id: '22222222-2222-4222-8222-222222222222',
        full_name: 'Nguyễn Văn A',
        phone: '0901234567',
        property_id: '11111111-1111-4111-8111-111111111111',
        message: 'Xin tư vấn',
        source: 'property_detail_form',
      },
    });
  });

  it('giữ id caller truyền vào để AI advisor link chat', () => {
    const result = parsePublicLeadPayload({
      id: '33333333-3333-4333-8333-333333333333',
      full_name: 'Nguyễn Văn A',
      phone: '0901234567',
      source: 'ai_advisor',
    }, '44444444-4444-4444-8444-444444444444');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.insert.id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('từ chối source ngoài whitelist và số điện thoại không hợp lệ', () => {
    const result = parsePublicLeadPayload({
      full_name: 'Nguyễn Văn A',
      phone: '0123456789',
      source: 'admin_import',
    }, 'lead-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      'Số điện thoại di động Việt Nam chưa hợp lệ.',
      'Nguồn lead không hợp lệ.',
    ]));
  });

  it('từ chối follow-up timestamp không hợp lệ và field quá dài', () => {
    const result = parsePublicLeadPayload({
      full_name: 'Nguyễn Văn A',
      phone: '0901234567',
      message: 'x'.repeat(4001),
      follow_up_at: 'không phải ngày',
    }, 'lead-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      'Lời nhắn quá dài.',
      'Thời gian gọi lại không hợp lệ.',
    ]));
  });

  it('từ chối UUID không hợp lệ và lịch gọi không thuộc callback', () => {
    const result = parsePublicLeadPayload({
      id: 'not-a-uuid',
      full_name: 'Nguyễn Văn A',
      phone: '0901234567',
      property_id: 'not-a-property-uuid',
      source: 'property_detail_form',
      follow_up_at: '2030-01-01T10:00:00.000Z',
    }, '55555555-5555-4555-8555-555555555555');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      'id không hợp lệ.',
      'property_id không hợp lệ.',
      'Chỉ yêu cầu gọi lại mới được đặt lịch gọi.',
    ]));
  });
});
