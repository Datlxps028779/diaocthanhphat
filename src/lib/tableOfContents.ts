import { buildSlug } from './slug';

// Trích tiêu đề từ nội dung bài viết để dựng mục lục tự động.
//
// Chỉ lấy h2 (mục lớn): đo dữ liệu thật thấy 14/23 bài có từ 10 heading trở lên,
// gộp cả h3 vào thì mục lục dài hơn cả phần tóm tắt.
//
// Hai ràng buộc từ dữ liệu thật:
//  - 2/23 bài có heading TRÙNG TÊN nhau → id phải thêm hậu tố số, nếu không bấm
//    mục sau sẽ nhảy về mục đầu.
//  - 1/23 bài không có heading nào → trả mảng rỗng để phía gọi ẩn hẳn khối.

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

export function extractHeadings(content: string): TocHeading[] {
  if (typeof content !== 'string' || !content.trim()) return [];

  const used = new Set<string>();
  const out: TocHeading[] = [];

  if (isHtml(content)) {
    for (const m of content.matchAll(H2_RE)) {
      const text = cleanText(m[2]);
      if (!text) continue;
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
  for (const line of content.split('\n')) {
    const m = line.match(/^##\s+(.+)$/);
    if (!m) continue;
    const text = cleanText(m[1]).replace(/[*_`]/g, '').trim();
    if (!text) continue;
    out.push({ id: makeId(text, used), text });
  }
  return out;
}

// Gắn id vào từng h2 để mục lục bấm được. Duyệt theo cùng thứ tự extractHeadings
// nên id khớp 1:1 — heading rỗng bị bỏ ở cả hai nơi.
export function injectHeadingIds(html: string, headings: TocHeading[]): string {
  if (!headings.length || typeof html !== 'string') return html;

  let i = 0;
  return html.replace(H2_RE, (full, attrs: string, inner: string) => {
    if (!cleanText(inner)) return full;
    const h = headings[i++];
    if (!h) return full;
    if (EXISTING_ID_RE.test(attrs)) return full;
    return `<h2 id="${h.id}"${attrs}>${inner}</h2>`;
  });
}
