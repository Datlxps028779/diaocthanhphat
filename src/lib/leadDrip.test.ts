import { describe, it, expect } from 'vitest';
import {
  dripStatusLabel, dripStatusTone, dripStepLabel, parseSupabaseRef, pickDripStep,
  renderDripMessage, summarizeDripLogs, supabaseSecretsUrl, validateDripStep, validateNurtureConfig,
  type DripLead, type DripStepConfig, type NurtureFilterConfig,
} from './leadDrip';

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

const step = (id: string, delay_days: number, sort_order: number): DripStepConfig => ({
  id, delay_days, sort_order, channel: 'zalo', message_template: '{ten} test', enabled: true,
});

const STEPS: DripStepConfig[] = [step('s1', 1, 0), step('s3', 3, 1), step('s7', 7, 2)];
const FILTER: NurtureFilterConfig = {
  eligible_statuses: ['new', 'contacted', 'nurturing', 'viewing', 'negotiating'],
  require_phone: true,
};

describe('leadDrip', () => {
  const NOW = at(2026, 7, 14);

  it('chọn bước đầu tiên chưa gửi khi đủ tuổi lead', () => {
    expect(pickDripStep(mk(), [], NOW, STEPS, FILTER)?.id).toBe('s1');
    expect(pickDripStep(mk(), ['s1'], NOW, STEPS, FILTER)?.id).toBe('s3');
  });

  it('không gửi lại bước đã gửi và chọn bước cuối khi các bước trước đã gửi', () => {
    const old = mk({ last_activity_at: iso(at(2026, 7, 1)) });
    expect(pickDripStep(old, ['s1', 's3'], NOW, STEPS, FILTER)?.id).toBe('s7');
    expect(pickDripStep(old, ['s1', 's3', 's7'], NOW, STEPS, FILTER)).toBeNull();
  });

  it('bỏ qua bước đang tắt', () => {
    const steps = [step('s1', 1, 0), { ...step('s3', 3, 1), enabled: false }, step('s7', 7, 2)];
    const old = mk({ last_activity_at: iso(at(2026, 7, 1)) });
    expect(pickDripStep(old, ['s1'], NOW, steps, FILTER)?.id).toBe('s7');
  });

  it('không gửi nếu terminal, ngoài eligible_statuses, hoặc chưa đủ tuổi', () => {
    expect(pickDripStep(mk({ status: 'won' }), [], NOW, STEPS, FILTER)).toBeNull();
    expect(pickDripStep(mk({ status: 'new' }), [], NOW, STEPS, { ...FILTER, eligible_statuses: ['contacted'] })).toBeNull();
    expect(pickDripStep(mk({ last_activity_at: iso(at(2026, 7, 14)) }), [], NOW, STEPS, FILTER)).toBeNull();
  });

  it('require_phone: bật thì loại lead thiếu SĐT, tắt thì vẫn nhận', () => {
    expect(pickDripStep(mk({ phone: '' }), [], NOW, STEPS, FILTER)).toBeNull();
    expect(pickDripStep(mk({ phone: '' }), [], NOW, STEPS, { ...FILTER, require_phone: false })?.id).toBe('s1');
  });

  it('không gửi khi đã có follow_up_at tương lai', () => {
    const lead = mk({ follow_up_at: iso(at(2026, 7, 15, 9)) });
    expect(pickDripStep(lead, [], NOW, STEPS, FILTER)).toBeNull();
  });

  it('dùng created_at nếu thiếu last_activity_at', () => {
    const lead = mk({ created_at: iso(at(2026, 7, 11)), last_activity_at: null });
    expect(pickDripStep(lead, [], NOW, STEPS, FILTER)?.id).toBe('s1');
  });

  it('render tin: thay đủ 4 biến từ dữ liệu lead', () => {
    const msg = renderDripMessage('{ten} ở {khu_vuc}, ngân sách {ngan_sach}, cần {nhu_cau}', {
      full_name: 'Chị Lan', area_interest: 'Thuận An', budget: '2-3 tỷ', message: 'nhà phố', note: null,
    });
    expect(msg).toBe('Chị Lan ở Thuận An, ngân sách 2-3 tỷ, cần nhà phố');
  });

  it('render tin: fallback từng biến khi cột rỗng', () => {
    const msg = renderDripMessage('{ten}|{khu_vuc}|{ngan_sach}|{nhu_cau}', {
      full_name: '', area_interest: null, budget: '  ', message: null, note: null,
    });
    expect(msg).toBe('Anh/Chị|khu vực bạn quan tâm|ngân sách của mình|nhu cầu BĐS');
  });

  it('render tin: nhu_cau ưu tiên message rồi note; giữ nguyên chữ thường', () => {
    expect(renderDripMessage('cần {nhu_cau}', { message: null, note: 'đất nền' })).toBe('cần đất nền');
    expect(renderDripMessage('không có biến', { full_name: 'X' })).toBe('không có biến');
  });

  it('validate bước: delay âm hoặc tin rỗng → lỗi; biến lạ → cảnh báo', () => {
    expect(validateDripStep({ delay_days: -1, message_template: 'x' }).ok).toBe(false);
    expect(validateDripStep({ delay_days: 1, message_template: '  ' }).ok).toBe(false);
    const warn = validateDripStep({ delay_days: 1, message_template: 'chào {ten} {xyz}' });
    expect(warn.ok).toBe(true);
    expect(warn.warnings[0]).toContain('{xyz}');
    expect(validateDripStep({ delay_days: 2, message_template: 'chào {ten}' }).warnings).toHaveLength(0);
  });

  it('label step: tra theo id, fallback lịch sử d1/d3/d7', () => {
    expect(dripStepLabel('s3', STEPS)).toBe('Nhắc sau 3 ngày');
    expect(dripStepLabel('d1', STEPS)).toBe('Nhắc sau 1 ngày');
    expect(dripStepLabel('unknown-id', STEPS)).toBe('unknown-id');
  });

  it('label/tone status ổn định cho UI', () => {
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

  it('tổng hợp drip log theo status', () => {
    expect(summarizeDripLogs([])).toEqual({ sent: 0, skipped: 0, failed: 0, total: 0 });
    const logs = [{ status: 'sent' }, { status: 'sent' }, { status: 'skipped' }, { status: 'failed' }] as const;
    expect(summarizeDripLogs([...logs])).toEqual({ sent: 2, skipped: 1, failed: 1, total: 4 });
  });

  it('suy project-ref và link secrets từ endpoint', () => {
    expect(parseSupabaseRef('https://abcd1234.supabase.co/functions/v1/nurture-drip')).toBe('abcd1234');
    expect(parseSupabaseRef(' https://ABCD1234.supabase.co/functions/v1/x ')).toBe('abcd1234');
    expect(parseSupabaseRef('https://abcd1234.supabase.co')).toBe('abcd1234');
    expect(parseSupabaseRef('')).toBeNull();
    expect(parseSupabaseRef('http://abcd1234.supabase.co/x')).toBeNull();
    expect(parseSupabaseRef('https://evil.com/x')).toBeNull();
    expect(parseSupabaseRef('https://abcd1234.supabase.co.evil.com/x')).toBeNull();
    expect(supabaseSecretsUrl('https://abcd1234.supabase.co/functions/v1/nurture-drip'))
      .toBe('https://supabase.com/dashboard/project/abcd1234/settings/functions');
    expect(supabaseSecretsUrl('nope')).toBeNull();
  });
});
