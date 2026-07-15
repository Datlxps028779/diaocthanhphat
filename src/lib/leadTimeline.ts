import { leadOriginLabel } from './leadSource';

// Ghép timeline "kín" cho hành trình lead: mọi khách phải có mốc khởi đầu (Tạo khách)
// dù activity 'created' chưa được ghi (lead từ form web, hoặc dữ liệu cũ trước khi có
// bảng lead_activities). Thuần, test được — không đụng DB.

export interface TimelineActivity {
  id: string;
  kind: 'created' | 'note' | 'call' | 'stage_change' | 'follow_up';
  body: string | null;
  author: string | null;
  created_at: string;
  synthetic?: boolean;   // true = mốc suy ra, không có trong DB
}

export interface TimelineLead {
  created_at: string;
  source: string | null;
}

export function originLabel(source: string | null): string {
  return leadOriginLabel(source);
}

// Trả timeline sắp xếp MỚI NHẤT TRƯỚC, đảm bảo có đúng 1 mốc 'created' ở cuối
// (điểm khởi đầu). Nếu DB đã có 'created' thì giữ nguyên; nếu chưa, chèn mốc suy ra
// từ created_at + nguồn của lead.
export function buildTimeline(lead: TimelineLead, activities: TimelineActivity[]): TimelineActivity[] {
  const sorted = [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const hasCreated = sorted.some(a => a.kind === 'created');
  if (hasCreated) return sorted;
  const synthetic: TimelineActivity = {
    id: `synthetic-created`,
    kind: 'created',
    body: originLabel(lead.source),
    author: null,
    created_at: lead.created_at,
    synthetic: true,
  };
  return [...sorted, synthetic];
}
