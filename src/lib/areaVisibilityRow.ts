import type { SearchVisibilityUrlAudit } from './api/searchVisibility';

// Khóa registry Search Visibility của một khu vực. Nguồn sự thật:
// buildAreaCandidates() trong src/lib/server/searchVisibility.ts dùng `area:${area.id}`.
// Dòng area_listing / neighborhood của cùng khu vực KHÔNG phải dòng của trang khu vực.
export function areaVisibilityRowKey(areaId: string | null | undefined): string | null {
  const id = (areaId ?? '').trim();
  return id ? `area:${id}` : null;
}

export function findAreaVisibilityRow(
  urls: SearchVisibilityUrlAudit[] | null | undefined,
  areaId: string | null | undefined,
): SearchVisibilityUrlAudit | null {
  const key = areaVisibilityRowKey(areaId);
  if (!key || !urls) return null;
  return urls.find(row => row.source_key === key) ?? null;
}

export type AreaVisibilityState = 'eligible' | 'excluded' | 'unknown';

export interface AreaVisibilityDescription {
  state: AreaVisibilityState;
  label: string;
  detail: string | null;
  evaluatedAt: string | null;
  googleVerdict: string | null;
}

// Không có dòng audit → 'unknown', tuyệt đối không suy diễn thành đủ điều kiện.
export function describeAreaVisibility(row: SearchVisibilityUrlAudit | null): AreaVisibilityDescription {
  if (!row) {
    return {
      state: 'unknown',
      label: 'Chưa có dòng audit cho khu vực này',
      detail: 'Chưa có bằng chứng audit — không kết luận khu vực đủ điều kiện index.',
      evaluatedAt: null,
      googleVerdict: null,
    };
  }
  if (row.eligible) {
    return {
      state: 'eligible',
      label: 'Đủ điều kiện vào registry/sitemap theo audit',
      detail: row.canonical_url,
      evaluatedAt: row.evaluated_at,
      googleVerdict: row.google_verdict,
    };
  }
  return {
    state: 'excluded',
    label: `Bị loại trừ: ${row.reason_code}`,
    detail: row.reason_detail,
    evaluatedAt: row.evaluated_at,
    googleVerdict: row.google_verdict,
  };
}

export function formatAuditTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('vi-VN');
}
