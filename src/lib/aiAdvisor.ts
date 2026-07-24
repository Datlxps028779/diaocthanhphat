import type { Property, AiChatKnowledge } from './supabase';
import { buildPropertyPath, type PropertyFilters } from './api/properties';
import { parseSearchIntent, normalizeVietnamese, type AiSearchMatch, type SearchTaxonomy } from './aiSearch';
import type { submitLead } from './api/leads';
import { isValidVnPhone } from './phone';

export type AdvisorStage = 'welcome' | 'collecting_need' | 'showing_matches' | 'collecting_contact' | 'submitted';
export interface AdvisorMessage { role: 'user' | 'assistant' | 'staff' | 'system'; text: string; chips?: string[] }
export interface AdvisorPropertySummary {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  priceText: string;
  location: string;
  legal: string | null;
  area: string | null;
  path: string;
}
export interface AdvisorLeadDraft { full_name: string; phone: string; message?: string }
export interface AdvisorTurnResult {
  reply: string;
  filters: Partial<PropertyFilters>;
  residualKeyword: string;
  matched: AiSearchMatch[];
  stage: AdvisorStage;
  safetyNote?: string;
}

type LeadPayload = Parameters<typeof submitLead>[0];
type SensitiveKind = 'legal' | 'loan' | 'investment';

export function isSensitiveAdviceRequest(text: string): SensitiveKind | null {
  const q = normalizeVietnamese(text);
  if (/\b(phap ly|cong chung|tranh chap|dat coc)\b/.test(q) || (/\b(so chung|so hong|so do)\b/.test(q) && /\b(co nen|mua duoc|kiem tra|rui ro|hop le)\b/.test(q))) return 'legal';
  if (/\b(vay|lai suat|ngan hang|tra gop|han muc)\b/.test(q)) return 'loan';
  // Không match "roi" trần: normalizeVietnamese("rồi") → "roi" và sẽ nuốt mọi câu có "rồi".
  if (/\b(dau tu|loi nhuan|sinh loi|cam ket|chi so roi|ty suat roi)\b/.test(q)) return 'investment';
  return null;
}

// Lời mặc định admin có thể chỉnh (site_settings group 'ai_chat'). Truyền qua opts;
// không truyền thì trả chuỗi cứng như cũ để test/hành vi cũ không đổi.
export interface AdvisorMessages { loan?: string; legal?: string; investment?: string }
export interface AdvisorOpts { knowledge?: AiChatKnowledge[]; messages?: AdvisorMessages }

export function safeAdviceResponse(kind: SensitiveKind, override?: string): string {
  if (override && override.trim()) return override.trim();
  if (kind === 'legal') {
    return 'Thông tin pháp lý chỉ nên xem như tham khảo. Anh/chị cần kiểm tra hồ sơ gốc, tình trạng quy hoạch và công chứng trước khi đặt cọc. Em có thể gửi nhu cầu cho tư vấn viên để kiểm tra kỹ từng tin.';
  }
  if (kind === 'loan') {
    return 'Lãi suất và hạn mức vay phụ thuộc ngân hàng, hồ sơ thu nhập và tài sản đảm bảo. Em không tự bịa con số lãi suất; em có thể chuyển thông tin cho tư vấn viên để đối chiếu phương án vay phù hợp.';
  }
  return 'Đầu tư BĐS cần xem vị trí, pháp lý, thanh khoản, dòng tiền và thời gian nắm giữ. Không có cam kết lợi nhuận cố định; em có thể gợi ý tin phù hợp và chuyển tư vấn viên phân tích sâu hơn.';
}

// Khớp kho tri thức admin soạn: chuẩn hóa text + từng cụm keyword (tách bởi , hoặc
// xuống dòng); nếu 1 cụm là substring của text đã chuẩn hóa → khớp. Entries đã
// order theo priority giảm dần (getAiChatKnowledge), nên trả entry khớp đầu tiên.
export function matchKnowledge(text: string, entries?: AiChatKnowledge[]): AiChatKnowledge | null {
  if (!entries || entries.length === 0) return null;
  const q = normalizeVietnamese(text);
  const sorted = [...entries].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const e of sorted) {
    if (e.is_active === false) continue;
    const phrases = e.keywords.split(/[,\n]/).map(s => normalizeVietnamese(s)).filter(Boolean);
    if (phrases.some(p => q.includes(p))) return e;
  }
  return null;
}

function sensitiveMessage(kind: SensitiveKind, messages?: AdvisorMessages): string {
  const override = kind === 'loan' ? messages?.loan : kind === 'legal' ? messages?.legal : messages?.investment;
  return safeAdviceResponse(kind, override);
}

export function formatAdvisorBudget(filters: Partial<PropertyFilters>): string {
  const unit = filters.listingType === 'cho_thue' ? 'triệu/tháng' : 'tỷ';
  if (filters.minPrice != null && filters.maxPrice != null) return `${filters.minPrice}–${filters.maxPrice} ${unit}`;
  if (filters.maxPrice != null) return `Dưới ${filters.maxPrice} ${unit}`;
  if (filters.minPrice != null) return `Trên ${filters.minPrice} ${unit}`;
  return '';
}

export function summarizeAdvisorNeed(turn: Pick<AdvisorTurnResult, 'filters' | 'matched'> & Partial<Pick<AdvisorTurnResult, 'residualKeyword'>>): string {
  const parts: string[] = [];
  const f = turn.filters;
  if (f.listingType === 'cho_thue') parts.push('nhu cầu thuê');
  else if (f.listingType === 'mua_ban') parts.push('nhu cầu mua');
  if (f.district) parts.push(`khu vực ${f.district}`);
  if (f.ward) parts.push(`phường/xã ${f.ward}`);
  const type = turn.matched.find(m => m.kind === 'type')?.label;
  if (type) parts.push(type);
  const budget = formatAdvisorBudget(f);
  if (budget) parts.push(budget);
  if (f.legal) parts.push(`pháp lý ${f.legal}`);
  if (f.bedrooms) parts.push(`${f.bedrooms}+ phòng ngủ`);
  if (f.minArea != null || f.maxArea != null) {
    parts.push(f.minArea != null && f.maxArea != null ? `${f.minArea}–${f.maxArea} m²` : f.maxArea != null ? `dưới ${f.maxArea} m²` : `trên ${f.minArea} m²`);
  }
  if (parts.length) return parts.join(', ');
  return turn.residualKeyword?.trim() || 'nhu cầu BĐS của anh/chị';
}

export function buildAdvisorTurn(input: string, taxonomy: SearchTaxonomy, opts?: AdvisorOpts): AdvisorTurnResult {
  // Parse intent TRƯỚC để không bỏ nhu cầu tìm tin khi câu vừa hỏi vay/pháp lý
  // vừa mô tả BĐS (vd "mua nhà 2 tỷ có vay ngân hàng"). Sau đó mới ghép lưu ý.
  const intent = parseSearchIntent(input, taxonomy);
  const sensitive = isSensitiveAdviceRequest(input);
  const kb = matchKnowledge(input, opts?.knowledge);

  // "Đủ mạnh để tìm tin" = confidence không thấp VÀ có filter cụ thể (giá/khu vực/
  // loại/diện tích), không chỉ mỗi ý mua/thuê. Nhờ vậy câu hỏi tư vấn thuần (vd
  // "sổ chung có nên mua không") vẫn đi nhánh nhạy cảm, còn "mua nhà 2 tỷ có vay
  // ngân hàng" thì vừa tìm tin ≤2 tỷ vừa ghép lưu ý vay.
  const f = intent.filters;
  const hasConcreteFilter = f.minPrice != null || f.maxPrice != null || !!f.district
    || !!f.ward || !!f.areaId || !!f.typeId || f.minArea != null || f.maxArea != null;

  // Intent đủ mạnh để tìm tin → showing_matches BÌNH THƯỜNG, nhưng nếu câu chạm
  // chủ đề nhạy cảm / khớp KB thì PREPEND câu lưu ý + set safetyNote (không bỏ tìm tin).
  if (intent.confidence !== 'low' && hasConcreteFilter) {
    const need = summarizeAdvisorNeed({ filters: intent.filters, matched: intent.matched });
    const base = `Em đã hiểu ${need}. Em sẽ gợi ý vài tin phù hợp nhất trước, anh/chị có thể lọc toàn bộ kết quả hoặc gửi thông tin để tư vấn viên hỗ trợ sâu hơn.`;
    const note = kb ? kb.answer : sensitive ? sensitiveMessage(sensitive, opts?.messages) : '';
    return {
      reply: note ? `${note}\n\n${base}` : base,
      filters: intent.filters,
      residualKeyword: intent.residualKeyword,
      matched: intent.matched,
      stage: 'showing_matches',
      ...(note ? { safetyNote: 'Thông tin chỉ mang tính tham khảo; tư vấn viên sẽ kiểm tra hồ sơ thực tế.' } : {}),
    };
  }

  // Intent yếu: ưu tiên KB admin soạn → rồi tới câu nhạy cảm mặc định.
  if (kb) {
    return { reply: kb.answer, filters: {}, residualKeyword: input.trim(), matched: [], stage: 'collecting_contact', safetyNote: 'Thông tin chỉ mang tính tham khảo; tư vấn viên sẽ kiểm tra hồ sơ thực tế.' };
  }
  if (sensitive) {
    return { reply: sensitiveMessage(sensitive, opts?.messages), filters: {}, residualKeyword: input.trim(), matched: [], stage: 'collecting_contact', safetyNote: 'Thông tin chỉ mang tính tham khảo; cần tư vấn viên kiểm tra hồ sơ thực tế.' };
  }
  return {
    reply: 'Em cần thêm một chút thông tin để lọc đúng: anh/chị muốn mua hay thuê, khu vực nào, tầm giá bao nhiêu và loại BĐS mong muốn là gì?',
    filters: {},
    residualKeyword: input.trim(),
    matched: [],
    stage: 'collecting_need',
  };
}

export function summarizePropertyForAdvisor(p: Property): AdvisorPropertySummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    image_url: p.image_url,
    priceText: p.price_label ?? `${p.price} ${p.price_unit}`,
    location: [p.district, p.city].filter(Boolean).join(', '),
    legal: p.legal_status,
    area: p.area_sqm ? `${p.area_sqm} m²` : null,
    path: buildPropertyPath(p),
  };
}

export function validateAdvisorLeadContact(input: AdvisorLeadDraft): { valid: boolean; error?: string } {
  const name = input.full_name.trim();
  if (!name) return { valid: false, error: 'Vui lòng nhập họ tên.' };
  if (!isValidVnPhone(input.phone)) return { valid: false, error: 'Vui lòng nhập số di động Việt Nam hợp lệ.' };
  return { valid: true };
}

export function buildAdvisorLeadPayload(input: AdvisorLeadDraft, turn: AdvisorTurnResult, property?: Pick<Property, 'id' | 'title'>): LeadPayload {
  const need = summarizeAdvisorNeed(turn);
  const propertyLine = property ? `\nBĐS quan tâm: ${property.title}` : '';
  const extra = input.message?.trim() ? `\nGhi chú: ${input.message.trim()}` : '';
  return {
    full_name: input.full_name.trim(),
    phone: input.phone.trim(),
    area_interest: need,
    budget: formatAdvisorBudget(turn.filters) || undefined,
    property_id: property?.id,
    property_title: property?.title,
    source: 'ai_advisor',
    message: `Nhu cầu từ AI Advisor: ${need}${propertyLine}${extra}`.slice(0, 1000),
  };
}
