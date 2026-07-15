import type { Property } from './supabase';
import { buildPropertyPath, type PropertyFilters } from './api/properties';
import { parseSearchIntent, normalizeVietnamese, type AiSearchMatch, type SearchTaxonomy } from './aiSearch';
import type { submitLead } from './api/leads';

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

export function safeAdviceResponse(kind: SensitiveKind): string {
  if (kind === 'legal') {
    return 'Thông tin pháp lý chỉ nên xem như tham khảo. Anh/chị cần kiểm tra hồ sơ gốc, tình trạng quy hoạch và công chứng trước khi đặt cọc. Em có thể gửi nhu cầu cho tư vấn viên để kiểm tra kỹ từng tin.';
  }
  if (kind === 'loan') {
    return 'Lãi suất và hạn mức vay phụ thuộc ngân hàng, hồ sơ thu nhập và tài sản đảm bảo. Em không tự bịa con số lãi suất; em có thể chuyển thông tin cho tư vấn viên để đối chiếu phương án vay phù hợp.';
  }
  return 'Đầu tư BĐS cần xem vị trí, pháp lý, thanh khoản, dòng tiền và thời gian nắm giữ. Không có cam kết lợi nhuận cố định; em có thể gợi ý tin phù hợp và chuyển tư vấn viên phân tích sâu hơn.';
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

export function buildAdvisorTurn(input: string, taxonomy: SearchTaxonomy): AdvisorTurnResult {
  const sensitive = isSensitiveAdviceRequest(input);
  if (sensitive) {
    return { reply: safeAdviceResponse(sensitive), filters: {}, residualKeyword: input.trim(), matched: [], stage: 'collecting_contact', safetyNote: 'Thông tin chỉ mang tính tham khảo; cần tư vấn viên kiểm tra hồ sơ thực tế.' };
  }
  const intent = parseSearchIntent(input, taxonomy);
  if (intent.confidence === 'low') {
    return {
      reply: 'Em cần thêm một chút thông tin để lọc đúng: anh/chị muốn mua hay thuê, khu vực nào, tầm giá bao nhiêu và loại BĐS mong muốn là gì?',
      filters: {},
      residualKeyword: input.trim(),
      matched: [],
      stage: 'collecting_need',
    };
  }
  const result: AdvisorTurnResult = {
    reply: `Em đã hiểu ${summarizeAdvisorNeed({ filters: intent.filters, matched: intent.matched })}. Em sẽ gợi ý vài tin phù hợp nhất trước, anh/chị có thể lọc toàn bộ kết quả hoặc gửi thông tin để tư vấn viên hỗ trợ sâu hơn.`,
    filters: intent.filters,
    residualKeyword: intent.residualKeyword,
    matched: intent.matched,
    stage: 'showing_matches',
  };
  return result;
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
  const digits = input.phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { valid: false, error: 'Vui lòng nhập số điện thoại hợp lệ.' };
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
