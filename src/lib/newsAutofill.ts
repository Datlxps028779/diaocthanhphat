import { isHtmlContent, stripHtml } from './markdown';
import type { FaqItem } from './propertyFaq';

// Tự sinh FAQ + GEO cho bài tin tức TỪ NỘI DUNG ĐÃ NHẬP — deterministic, không gọi AI
// (tránh timeout/504). Đáp án FAQ lấy trực tiếp từ câu trong bài nên không bịa nội dung.

function paragraphs(content: string): string[] {
  const raw = content.trim();
  if (!raw) return [];
  if (isHtmlContent(raw)) {
    return (raw.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
      .map(p => stripHtml(p).trim())
      .filter(Boolean);
  }
  return raw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

function firstSentences(text: string, max = 2): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.split(/(?<=[.!?…])\s+/).slice(0, max);
  const out = parts.join(' ').trim();
  return out.length > 320 ? `${out.slice(0, 317).trimEnd()}…` : out;
}

export interface NewsFaqMeta {
  title?: string;
  category?: string;
  geoArea?: string;
}

// Sinh câu hỏi + trả lời từ chính nội dung bài. Trả [] khi chưa có đoạn văn nào.
export function autofillNewsFaq(content: string, meta: NewsFaqMeta): FaqItem[] {
  const paras = paragraphs(content);
  if (!paras.length) return [];
  const items: FaqItem[] = [];
  const topic = meta.title?.trim();
  const area = meta.geoArea?.trim();
  const category = meta.category?.trim();

  items.push({
    question: topic ? `Nội dung chính của "${topic}" là gì?` : 'Nội dung chính của bài viết là gì?',
    answer: firstSentences(paras[0]),
  });

  if (area) {
    const areaPara = paras.find(p => p.toLowerCase().includes(area.toLowerCase())) || paras[1];
    if (areaPara) items.push({
      question: `Thông tin này tác động thế nào đến bất động sản tại ${area}?`,
      answer: firstSentences(areaPara),
    });
  }

  const notePara = paras.find(p => /lưu ý|nhà đầu tư|pháp lý|quy hoạch|rủi ro/i.test(p));
  if (category && notePara) items.push({
    question: `Nhà đầu tư quan tâm ${category.toLowerCase()} cần lưu ý điều gì?`,
    answer: firstSentences(notePara),
  });

  if (paras.length > 1) items.push({
    question: 'Người mua/bán nên hành động ra sao trước thông tin này?',
    answer: firstSentences(paras[paras.length - 1]),
  });

  // Dedup theo câu hỏi, giữ câu có đáp án.
  const seen = new Set<string>();
  return items.filter(it => {
    const key = it.question.trim();
    if (!it.answer || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Danh sách khu vực Bình Dương (sau sáp nhập) — dài/cụ thể trước để không bị tỉnh che.
const DISTRICTS = ['Thủ Dầu Một', 'Bắc Tân Uyên', 'Tân Uyên', 'Dĩ An', 'Thuận An', 'Bến Cát', 'Bàu Bàng', 'Dầu Tiếng', 'Phú Giáo'];
const PROVINCES = ['Thành phố Hồ Chí Minh', 'TP. Hồ Chí Minh', 'TP.HCM', 'Bình Dương'];

const ENTITY_MATCHERS: RegExp[] = [
  /Vành đai\s*\d+/i,
  /VSIP(?:\s*[IVX0-9]+)?/i,
  /(?:cao tốc|quốc lộ)\s+[\p{Lu}\p{N}][^\s,.;]*(?:\s+[\p{Lu}\p{N}][^\s,.;]*){0,2}/u,
  /(?:khu công nghiệp|KCN)\s+[\p{Lu}][\p{L}]*(?:\s+[\p{Lu}\p{N}][\p{L}\p{N}]*){0,2}/u,
  /(?:sân bay|cảng|metro|tuyến metro)\s+[\p{Lu}\p{N}][^\s,.;]*/u,
];

export interface NewsGeo {
  geoArea: string;
  geoEntity: string;
  geoNotes: string;
}

// Trích GEO/AEO từ nội dung + tiêu đề. Field nào không tìm thấy để chuỗi rỗng.
export function autofillNewsGeo(content: string, title = ''): NewsGeo {
  const text = `${title}\n${plainText(content)}`;
  const district = DISTRICTS.find(d => text.includes(d)) || '';
  const province = PROVINCES.find(p => text.includes(p)) || '';
  const geoArea = [district, province].filter(Boolean).join(', ');

  let geoEntity = '';
  let bestIndex = Infinity;
  for (const re of ENTITY_MATCHERS) {
    const m = re.exec(text);
    if (m && m.index < bestIndex) { bestIndex = m.index; geoEntity = m[0].replace(/\s+/g, ' ').trim(); }
  }

  const mentions: string[] = [];
  for (const re of ENTITY_MATCHERS) {
    const m = re.exec(text);
    if (m) mentions.push(m[0].replace(/\s+/g, ' ').trim());
  }
  for (const d of DISTRICTS) if (text.includes(d)) mentions.push(d);
  const uniqueMentions = [...new Set(mentions)].slice(0, 4);
  const geoNotes = uniqueMentions.length ? `Liên quan: ${uniqueMentions.join(', ')}.` : '';

  return { geoArea, geoEntity, geoNotes };
}

function plainText(content: string): string {
  const raw = content.trim();
  if (!raw) return '';
  return isHtmlContent(raw) ? stripHtml(raw) : raw;
}
