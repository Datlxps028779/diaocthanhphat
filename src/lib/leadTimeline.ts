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

// Nhãn nguồn để mô tả mốc tạo suy ra ("Phát sinh từ ...").
const SOURCE_ORIGIN: Record<string, string> = {
  property_detail_form: 'form trang chi tiết',
  phone_reveal: 'bấm hiện số',
  contact_modal: 'popup liên hệ',
  invest_page: 'trang đầu tư',
  about_page: 'trang liên hệ',
  admin_manual: 'nhập tay',
};

export function originLabel(source: string | null): string {
  if (!source) return 'Phát sinh khách mới';
  return `Phát sinh từ ${SOURCE_ORIGIN[source] ?? source}`;
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
