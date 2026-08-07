import { buildSlug } from './slug';

// Trích tiêu đề từ nội dung bài viết để dựng mục lục tự động.
//
// Chỉ lấy h2 (mục lớn): đo dữ liệu thật thấy 14/23 bài có từ 10 heading trở lên,
// gộp cả h3 vào thì mục lục dài hơn cả phần tóm tắt.
//
// Hai ràng buộc từ dữ liệu thật (26 bài):
//  - 3 bài dùng h2 làm NHÃN LẶP ("Trả lời nhanh" 13 lần) → lọc bỏ, xem keptHtmlTitles.
//  - 1 bài không có heading nào → trả mảng rỗng để phía gọi ẩn hẳn khối.

export interface TocHeading {
  id: string;
  text: string;
}

// Dưới ngưỡng này thì mục lục vô nghĩa (1 mục = chỉ tốn chỗ).
export const TOC_MIN_HEADINGS = 2;

const ID_PREFIX = 'muc-';

// Chỉ giải mã vài entity hay gặp trong tiêu đề. Không dùng DOM vì hàm này phải
// chạy được cả trên server (RSC) lẫn client.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&agrave;/gi, 'à')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&ocirc;/gi, 'ô')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function cleanText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function isHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

// id ổn định + duy nhất. buildSlug bỏ dấu tiếng Việt; tiêu đề toàn ký tự đặc biệt
// sẽ ra chuỗi fallback nên vẫn dùng được làm anchor.
function makeId(text: string, used: Set<string>): string {
  const base = `${ID_PREFIX}${buildSlug(text)}`;
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

const H2_RE = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
const EXISTING_ID_RE = /\bid\s*=\s*["']([^"']+)["']/i;

// Nhiều bài dùng h2 làm NHÃN CẤU TRÚC lặp đi lặp lại ("Trả lời nhanh" 13 lần trong
// 26 bài, "Phân tích" 4 lần) chứ không phải mục riêng. Liệt kê chúng thì mục lục
// toàn dòng giống nhau. Quy ước: tên xuất hiện >1 lần trong cùng bài = nhãn, bỏ hết.
// Kèm bỏ h2 tên "Mục lục" (1 bài tự chèn sẵn — giữ lại thì mục lục trỏ vào chính nó).
const SELF_TITLES = new Set(['mục lục', 'muc luc']);

function isStructuralLabel(text: string, counts: Map<string, number>): boolean {
  const key = text.toLowerCase();
  return SELF_TITLES.has(key) || (counts.get(key) ?? 0) > 1;
}

// Danh sách tiêu đề h2 đã lọc, theo đúng thứ tự xuất hiện. Dùng chung cho cả
// extractHeadings lẫn injectHeadingIds nên hai bên không bao giờ lệch nhịp —
// lệch một nhịp là id rơi vào sai thẻ và bấm mục lục nhảy nhầm chỗ.
function keptHtmlTitles(content: string): string[] {
  const all: string[] = [];
  for (const m of content.matchAll(H2_RE)) {
    const t = cleanText(m[2]);
    if (t) all.push(t);
  }
  const counts = new Map<string, number>();
  for (const t of all) {
    const k = t.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return all.filter(t => !isStructuralLabel(t, counts));
}

// Tên các h2 bị lặp trong bài — dùng cho cảnh báo lúc soạn bài trong admin. Chung
// nguồn với keptHtmlTitles nên cảnh báo và mục lục không bao giờ nói khác nhau.
export function findDuplicateHeadings(content: string): string[] {
  if (typeof content !== 'string' || !isHtml(content)) return [];
  const counts = new Map<string, { text: string; n: number }>();
  for (const m of content.matchAll(H2_RE)) {
    const t = cleanText(m[2]);
    if (!t) continue;
    const k = t.toLowerCase();
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { text: t, n: 1 });
  }
  return [...counts.values()].filter(v => v.n > 1).map(v => v.text);
}

export function extractHeadings(content: string): TocHeading[] {
  if (typeof content !== 'string' || !content.trim()) return [];

  const used = new Set<string>();
  const out: TocHeading[] = [];

  if (isHtml(content)) {
    const kept = new Set(keptHtmlTitles(content));
    for (const m of content.matchAll(H2_RE)) {
      const text = cleanText(m[2]);
      if (!text || !kept.has(text)) continue;
      const existing = m[1].match(EXISTING_ID_RE)?.[1];
      if (existing && !used.has(existing)) {
        used.add(existing);
        out.push({ id: existing, text });
      } else {
        out.push({ id: makeId(text, used), text });
      }
    }
    return out;
  }

  // Markdown: chỉ '## ' (h2), không lấy '### '. Neo ^ theo từng dòng để '#' giữa
  // câu không bị nhầm là heading.
  const mdTitles: string[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^##\s+(.+)$/);
    if (!m) continue;
    const text = cleanText(m[1]).replace(/[*_`]/g, '').trim();
    if (text) mdTitles.push(text);
  }
  const mdCounts = new Map<string, number>();
  for (const t of mdTitles) {
    const k = t.toLowerCase();
    mdCounts.set(k, (mdCounts.get(k) ?? 0) + 1);
  }
  for (const text of mdTitles) {
    if (isStructuralLabel(text, mdCounts)) continue;
    out.push({ id: makeId(text, used), text });
  }
  return out;
}

// Gắn id vào từng h2 để mục lục bấm được. Bỏ qua đúng những heading mà
// extractHeadings đã loại, nhờ dùng chung keptHtmlTitles → id khớp 1:1.
export function injectHeadingIds(html: string, headings: TocHeading[]): string {
  if (!headings.length || typeof html !== 'string') return html;

  const kept = new Set(keptHtmlTitles(html));
  let i = 0;
  return html.replace(H2_RE, (full, attrs: string, inner: string) => {
    const text = cleanText(inner);
    if (!text || !kept.has(text)) return full;
    const h = headings[i++];
    if (!h) return full;
    if (EXISTING_ID_RE.test(attrs)) return full;
    return `<h2 id="${h.id}"${attrs}>${inner}</h2>`;
  });
}
