import { describe, expect, it } from 'vitest';
import { areaVisibilityRowKey, findAreaVisibilityRow, describeAreaVisibility, formatAuditTimestamp } from './areaVisibilityRow';
import type { SearchVisibilityUrlAudit } from './api/searchVisibility';

function areaRow(overrides: Partial<SearchVisibilityUrlAudit> = {}): SearchVisibilityUrlAudit {
  return {
    source_key: 'area:area-1',
    entity_type: 'area',
    canonical_url: 'https://chonhaviet.com/khu-vuc/binh-duong',
    eligible: true,
    reason_code: 'ELIGIBLE',
    reason_detail: null,
    evaluated_at: '2026-09-15T02:00:00.000Z',
    sitemap_status: 'pending',
    inspection_status: 'none',
    google_verdict: null,
    google_coverage_state: null,
    google_canonical: null,
    user_canonical: null,
    google_robots_state: null,
    evidence_observed_at: null,
    ...overrides,
  };
}

describe('areaVisibilityRowKey', () => {
  it('dựng đúng khóa registry của dòng khu vực (area:<id>)', () => {
    expect(areaVisibilityRowKey('area-1')).toBe('area:area-1');
  });

  it('không dựng khóa khi thiếu id để tránh khớp nhầm dòng khác', () => {
    expect(areaVisibilityRowKey('')).toBeNull();
    expect(areaVisibilityRowKey('   ')).toBeNull();
    expect(areaVisibilityRowKey(undefined)).toBeNull();
  });
});

describe('findAreaVisibilityRow', () => {
  it('lấy đúng dòng eligible của khu vực theo source_key', () => {
    const urls = [areaRow({ source_key: 'area:area-2' }), areaRow({ source_key: 'area:area-1' })];
    expect(findAreaVisibilityRow(urls, 'area-1')?.source_key).toBe('area:area-1');
  });

  it('lấy được cả dòng bị loại trừ của khu vực (có lý do noindex)', () => {
    const excluded = areaRow({
      eligible: false,
      reason_code: 'QUALITY_GATE_FAILED',
      reason_detail: 'Thiếu tin đăng thật, thiếu mô tả riêng',
      canonical_url: null,
    });
    expect(findAreaVisibilityRow([excluded], 'area-1')).toMatchObject({
      eligible: false,
      reason_code: 'QUALITY_GATE_FAILED',
    });
  });

  it('không lấy dòng area_listing hay neighborhood của cùng khu vực', () => {
    const urls = [
      areaRow({ source_key: 'area_listing:mua_ban:area-1', entity_type: 'area_listing' }),
      areaRow({ source_key: 'neighborhood:area-1', entity_type: 'neighborhood' }),
    ];
    expect(findAreaVisibilityRow(urls, 'area-1')).toBeNull();
  });

  it('trả null khi audit chưa có và khi chưa chọn khu vực', () => {
    expect(findAreaVisibilityRow([], 'area-1')).toBeNull();
    expect(findAreaVisibilityRow(null, 'area-1')).toBeNull();
    expect(findAreaVisibilityRow([areaRow()], '')).toBeNull();
  });
});

describe('describeAreaVisibility', () => {
  it('dòng eligible → đủ điều kiện, kèm URL canonical của audit', () => {
    expect(describeAreaVisibility(areaRow())).toEqual({
      state: 'eligible',
      label: 'Đủ điều kiện vào registry/sitemap theo audit',
      detail: 'https://chonhaviet.com/khu-vuc/binh-duong',
      evaluatedAt: '2026-09-15T02:00:00.000Z',
      googleVerdict: null,
    });
  });

  it('dòng bị loại trừ → nêu đúng mã và chi tiết lý do từ audit', () => {
    expect(describeAreaVisibility(areaRow({
      eligible: false,
      reason_code: 'QUALITY_GATE_FAILED',
      reason_detail: 'Thiếu tin đăng thật',
      canonical_url: null,
    }))).toEqual({
      state: 'excluded',
      label: 'Bị loại trừ: QUALITY_GATE_FAILED',
      detail: 'Thiếu tin đăng thật',
      evaluatedAt: '2026-09-15T02:00:00.000Z',
      googleVerdict: null,
    });
  });

  it('không có dòng audit → trạng thái "chưa có audit", KHÔNG phải pass', () => {
    expect(describeAreaVisibility(null)).toEqual({
      state: 'unknown',
      label: 'Chưa có dòng audit cho khu vực này',
      detail: 'Chưa có bằng chứng audit — không kết luận khu vực đủ điều kiện index.',
      evaluatedAt: null,
      googleVerdict: null,
    });
  });
});

describe('formatAuditTimestamp', () => {
  it('hiện mốc thời gian audit theo giờ Việt Nam', () => {
    expect(formatAuditTimestamp('2026-09-15T02:00:00.000Z')).toContain('2026');
  });

  it('trả null khi audit chưa có mốc thời gian để không hiện mốc giả', () => {
    expect(formatAuditTimestamp(null)).toBeNull();
    expect(formatAuditTimestamp(undefined)).toBeNull();
    expect(formatAuditTimestamp('')).toBeNull();
  });

  it('trả null khi mốc thời gian không đọc được', () => {
    expect(formatAuditTimestamp('khong-phai-thoi-gian')).toBeNull();
  });
});
