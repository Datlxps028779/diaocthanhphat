import { describe, it, expect } from 'vitest';
import { dripMessage, dripStatusLabel, dripStatusTone, dripStepLabel, pickDripStep, validateNurtureConfig, type DripLead } from './leadDrip';

const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h, 0, 0);
const iso = (dt: Date) => dt.toISOString();

const mk = (o: Partial<DripLead> = {}): DripLead => ({
  status: 'nurturing',
  created_at: iso(at(2026, 7, 10)),
  last_activity_at: iso(at(2026, 7, 10)),
  phone: '0909123456',
  full_name: 'Anh Nam',
  ...o,
});

describe('leadDrip', () => {
  const NOW = at(2026, 7, 14);

  it('chọn bước đầu tiên chưa gửi khi đủ tuổi lead', () => {
    expect(pickDripStep(mk(), [], NOW)?.key).toBe('d1');
    expect(pickDripStep(mk(), ['d1'], NOW)?.key).toBe('d3');
  });

  it('không gửi lại bước đã gửi và chọn d7 khi các bước trước đã gửi', () => {
    const old = mk({ last_activity_at: iso(at(2026, 7, 1)) });
    expect(pickDripStep(old, ['d1', 'd3'], NOW)?.key).toBe('d7');
    expect(pickDripStep(old, ['d1', 'd3', 'd7'], NOW)).toBeNull();
  });

  it('không gửi nếu terminal, thiếu SĐT, hoặc chưa đủ tuổi', () => {
    expect(pickDripStep(mk({ status: 'won' }), [], NOW)).toBeNull();
    expect(pickDripStep(mk({ phone: '' }), [], NOW)).toBeNull();
    expect(pickDripStep(mk({ last_activity_at: iso(at(2026, 7, 14)) }), [], NOW)).toBeNull();
  });

  it('không gửi khi đã có follow_up_at tương lai', () => {
    const lead = mk({ follow_up_at: iso(at(2026, 7, 15, 9)) });
    expect(pickDripStep(lead, [], NOW)).toBeNull();
  });

  it('dùng created_at nếu thiếu last_activity_at', () => {
    const lead = mk({ created_at: iso(at(2026, 7, 11)), last_activity_at: null });
    expect(pickDripStep(lead, [], NOW)?.key).toBe('d1');
  });

  it('tạo nội dung Zalo có fallback tên', () => {
    expect(dripMessage({ key: 'd1', delayDays: 1, label: 'x' }, { full_name: 'Chị Lan' })).toContain('Chị Lan');
    expect(dripMessage({ key: 'd7', delayDays: 7, label: 'x' }, { full_name: '' })).toContain('Anh/Chị');
  });

  it('label step/status ổn định cho UI', () => {
    expect(dripStepLabel('d1')).toBe('Nhắc sau 1 ngày');
    expect(dripStatusLabel('sent')).toBe('Đã gửi');
    expect(dripStatusTone('skipped')).toBe('amber');
    expect(dripStatusTone('failed')).toBe('red');
  });

  it('validate config: bật drip cần endpoint + secret', () => {
    expect(validateNurtureConfig({ enabled: true, endpoint: '', secret: 'x' })).toEqual({ ok: false, error: 'Cần nhập endpoint Edge Function trước khi bật drip.' });
    expect(validateNurtureConfig({ enabled: true, endpoint: 'https://fn.example', secret: '' })).toEqual({ ok: false, error: 'Cần nhập NURTURE_DRIP_SECRET trước khi bật drip.' });
  });

  it('validate config: endpoint phải dùng https và được trim', () => {
    expect(validateNurtureConfig({ enabled: false, endpoint: 'http://fn.example', secret: null })).toEqual({ ok: false, error: 'Endpoint phải bắt đầu bằng https://.' });
    expect(validateNurtureConfig({ enabled: true, endpoint: ' https://fn.example ', secret: ' abc ' })).toEqual({
      ok: true,
      value: { enabled: true, endpoint: 'https://fn.example', secret: 'abc' },
    });
  });
});
