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
  matchScore?: number;
}
export interface AdvisorLeadDraft { full_name: string; phone: string; message?: string }
export interface AdvisorTurnResult {
  reply: string;
  filters: Partial<PropertyFilters>;
  residualKeyword: string;
  matched: AiSearchMatch[];
  stage: AdvisorStage;
  safetyNote?: string;
  knowledgeSource?: AiChatKnowledge['knowledge_type'];
  handoffRequired?: boolean;
}

type LeadPayload = Parameters<typeof submitLead>[0];
type SensitiveKind = 'legal' | 'loan' | 'investment';
type KnowledgeMatch = { entry: AiChatKnowledge; score: number };

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
export interface AdvisorMessages { loan?: string; legal?: string; investment?: string; unknown?: string; handoff?: string }
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

const TYPO_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bso\s+h(o+|og|ongg|ong)\b/g, 'so hong'],
  [/\bso\s+h[oa]\w*\b/g, 'so hong'],
  [/\bs[oa]\s+chung\b/g, 'so chung'],
  [/\bfap\s+l[yi]\b/g, 'phap ly'],
  [/\bphap\s+li\b/g, 'phap ly'],
  [/\bvay\s+ngan\s+hangg\b/g, 'vay ngan hang'],
  [/\bvay\s+nh\b/g, 'vay ngan hang'],
  [/\bvay\s+nhang\b/g, 'vay ngan hang'],
  [/\blai\s+xuat\b/g, 'lai suat'],
  [/\bdi\s*an\b/g, 'di an'],
  [/\bdian\b/g, 'di an'],
  [/\bnha\s+fo\b/g, 'nha pho'],
  [/\bko\b/g, 'khong'],
  [/\bk\b/g, 'khong'],
];

export function normalizeAdvisorQuery(text: string): string {
  let q = normalizeVietnamese(text);
  TYPO_REPLACEMENTS.forEach(([re, to]) => { q = q.replace(re, to); });
  return q.replace(/\s+/g, ' ').trim();
}

function knowledgeTypeRank(e: AiChatKnowledge): number {
  const type = e.knowledge_type ?? 'priority_qa';
  if (type === 'priority_qa') return 400;
  if (type === 'background') return 250;
  return 0;
}

function splitKnowledgeTerms(entry: AiChatKnowledge): string[] {
  return [entry.keywords, entry.question_examples, entry.typo_variants]
    .filter((v): v is string => Boolean(v?.trim()))
    .flatMap(v => v.split(/[,\n]/))
    .map(normalizeAdvisorQuery)
    .filter(Boolean);
}

function scoreKnowledge(text: string, entry: AiChatKnowledge): KnowledgeMatch | null {
  if (entry.is_active === false || entry.knowledge_type === 'test_case' || entry.knowledge_type === 'rule') return null;
  const q = normalizeAdvisorQuery(text);
  const terms = splitKnowledgeTerms(entry);
  if (!terms.length) return null;
  let best = 0;
  for (const term of terms) {
    if (!term) continue;
    if (q === term) best = Math.max(best, 120);
    else if (new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($| )`).test(q)) best = Math.max(best, 90 + Math.min(term.length, 40));
    else if (q.includes(term)) best = Math.max(best, 60 + Math.min(term.length, 30));
    else {
      const words = term.split(' ').filter(w => w.length >= 3);
      const hits = words.filter(w => new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($| )`).test(q)).length;
      if (words.length >= 2 && hits >= Math.ceil(words.length * 0.7)) best = Math.max(best, 35 + hits * 6);
    }
  }
  if (best < 35) return null;
  return { entry, score: best + knowledgeTypeRank(entry) + (entry.priority ?? 0) };
}

export function findKnowledgeMatch(text: string, entries?: AiChatKnowledge[]): KnowledgeMatch | null {
  const matches = (entries ?? [])
    .map(e => scoreKnowledge(text, e))
    .filter((m): m is KnowledgeMatch => Boolean(m))
    .sort((a, b) => b.score - a.score || (b.entry.priority ?? 0) - (a.entry.priority ?? 0));
  return matches[0] ?? null;
}

export function matchKnowledge(text: string, entries?: AiChatKnowledge[]): AiChatKnowledge | null {
  return findKnowledgeMatch(text, entries)?.entry ?? null;
}

function sensitiveMessage(kind: SensitiveKind, messages?: AdvisorMessages): string {
  const override = kind === 'loan' ? messages?.loan : kind === 'legal' ? messages?.legal : messages?.investment;
  return safeAdviceResponse(kind, override);
}

function unknownMessage(messages?: AdvisorMessages): string {
  return messages?.unknown?.trim() || 'Em chưa có dữ liệu xác thực để kết luận phần này. Anh/chị có thể để lại thông tin để tư vấn viên kiểm tra trên dữ liệu và hồ sơ thực tế.';
}

function handoffMessage(messages?: AdvisorMessages): string {
  return messages?.handoff?.trim() || 'Em sẽ chuyển nội dung này cho tư vấn viên để kiểm tra kỹ hơn trước khi tư vấn chi tiết.';
}

function asksForUnsupportedFact(text: string): boolean {
  const q = normalizeAdvisorQuery(text);
  return /\b(tang bao nhieu|bao nhieu phan tram|%|quy hoach|loi chac|chac loi|cam ket loi|lai suat bao nhieu|gia thi truong hien tai)\b/.test(q);
}

function mustNotAnswerHit(text: string, entry?: AiChatKnowledge | null): boolean {
  if (!entry?.must_not_answer?.trim()) return false;
  const q = normalizeAdvisorQuery(text);
  return entry.must_not_answer
    .split(/[,\n.;]/)
    .map(normalizeAdvisorQuery)
    .filter(term => term.length >= 4)
    .some(term => q.includes(term));
}

function safetyNoteFor(entry?: AiChatKnowledge | null): string {
  return entry?.guardrail?.trim() || 'Thông tin chỉ mang tính tham khảo; tư vấn viên sẽ kiểm tra hồ sơ thực tế.';
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

export function detectHandoffTriggers(text: string): boolean {
  const q = normalizeAdvisorQuery(text);
  return isValidVnPhone(text)
    || /\b(quy hoach|dau tu|loi nhuan|cam ket|dat coc|di xem|xem nha|xem dat|goi lai|lien he|tu van vien|gap sale|gap moi gioi|phap ly chuyen sau|kiem tra ho so)\b/.test(q);
}

export function buildAdvisorTurn(input: string, taxonomy: SearchTaxonomy, opts?: AdvisorOpts): AdvisorTurnResult {
  const normalizedInput = normalizeAdvisorQuery(input);
  const intent = parseSearchIntent(normalizedInput, taxonomy);
  const sensitive = isSensitiveAdviceRequest(normalizedInput);
  const knowledgeMatch = findKnowledgeMatch(input, opts?.knowledge);
  const kb = knowledgeMatch?.entry ?? null;

  const f = intent.filters;
  const hasConcreteFilter = f.minPrice != null || f.maxPrice != null || !!f.district
    || !!f.ward || !!f.areaId || !!f.typeId || f.minArea != null || f.maxArea != null;
  const mustNotAnswer = mustNotAnswerHit(input, kb);
  const handoffRequired = Boolean(kb?.handoff_required) || Boolean(sensitive) || asksForUnsupportedFact(input) || mustNotAnswer || detectHandoffTriggers(input);

  if (mustNotAnswer) {
    return {
      reply: `${unknownMessage(opts?.messages)}\n\n${handoffMessage(opts?.messages)}`,
      filters: {},
      residualKeyword: input.trim(),
      matched: [],
      stage: 'collecting_contact',
      safetyNote: safetyNoteFor(kb),
      ...(kb ? { knowledgeSource: kb.knowledge_type ?? 'priority_qa' } : {}),
      handoffRequired: true,
    };
  }

  if (asksForUnsupportedFact(input) && !kb && !sensitive) {
    return {
      reply: `${unknownMessage(opts?.messages)}\n\n${handoffMessage(opts?.messages)}`,
      filters: {},
      residualKeyword: input.trim(),
      matched: [],
      stage: 'collecting_contact',
      safetyNote: 'Không có dữ liệu xác thực thì không tự bịa câu trả lời.',
      handoffRequired: true,
    };
  }

  if (intent.confidence !== 'low' && hasConcreteFilter) {
    const need = summarizeAdvisorNeed({ filters: intent.filters, matched: intent.matched });
    const base = `Em đã hiểu ${need}. Em sẽ gợi ý vài tin phù hợp nhất trước, anh/chị có thể lọc toàn bộ kết quả hoặc gửi thông tin để tư vấn viên hỗ trợ sâu hơn.`;
    const note = kb ? kb.answer : sensitive ? sensitiveMessage(sensitive, opts?.messages) : '';
    const handoff = handoffRequired && note ? `\n\n${handoffMessage(opts?.messages)}` : '';
    return {
      reply: note ? `${note}${handoff}\n\n${base}` : base,
      filters: intent.filters,
      residualKeyword: intent.residualKeyword,
      matched: intent.matched,
      stage: 'showing_matches',
      ...(note ? { safetyNote: safetyNoteFor(kb) } : {}),
      ...(kb ? { knowledgeSource: kb.knowledge_type ?? 'priority_qa' } : {}),
      ...(handoffRequired ? { handoffRequired: true } : {}),
    };
  }

  if (kb) {
    const extra = (kb.handoff_required || handoffRequired) ? `\n\n${handoffMessage(opts?.messages)}` : '';
    return {
      reply: `${kb.answer}${extra}`,
      filters: {},
      residualKeyword: input.trim(),
      matched: [],
      stage: 'collecting_contact',
      safetyNote: safetyNoteFor(kb),
      knowledgeSource: kb.knowledge_type ?? 'priority_qa',
      ...(kb.handoff_required || handoffRequired ? { handoffRequired: true } : {}),
    };
  }
  if (sensitive) {
    return {
      reply: `${sensitiveMessage(sensitive, opts?.messages)}\n\n${handoffMessage(opts?.messages)}`,
      filters: {},
      residualKeyword: input.trim(),
      matched: [],
      stage: 'collecting_contact',
      safetyNote: 'Thông tin chỉ mang tính tham khảo; cần tư vấn viên kiểm tra hồ sơ thực tế.',
      handoffRequired: true,
    };
  }
  return {
    reply: 'Em cần thêm một chút thông tin để lọc đúng: anh/chị muốn mua hay thuê, khu vực nào, tầm giá bao nhiêu và loại BĐS mong muốn là gì?',
    filters: {},
    residualKeyword: input.trim(),
    matched: [],
    stage: 'collecting_need',
  };
}

export function summarizePropertyForAdvisor(p: Property & { matchScore?: number }): AdvisorPropertySummary {
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
    ...(p.matchScore != null ? { matchScore: p.matchScore } : {}),
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
