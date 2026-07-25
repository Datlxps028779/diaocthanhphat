import DOMPurify from 'isomorphic-dompurify';

const TEXT_ALIGN_STYLE = /^\s*text-align:\s*(left|right|center|justify);?\s*$/i;
const ALLOWED_TAGS = ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre'];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'colspan', 'rowspan'];

export const ARTICLE_SANITIZE = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:https?:|\/)/i,
};

// Hook DOMPurify là toàn cục nên chỉ đăng ký 1 lần: (1) chỉ giữ style text-align,
// (2) ép rel=noopener noreferrer cho link mở tab mới (chống tabnabbing).
let hooksRegistered = false;
function registerHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style' && !TEXT_ALIGN_STYLE.test(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// Bỏ heading/đoạn rỗng (h2 rỗng đầu bài AI, đoạn chỉ có &nbsp;/<br>).
function stripEmptyBlocks(html: string): string {
  return html.replace(/<(h2|h3|h4|p)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '');
}

export function sanitizeArticleHtml(raw: string): string {
  registerHooks();
  const clean = DOMPurify.sanitize(raw, ARTICLE_SANITIZE) as string;
  return stripEmptyBlocks(clean);
}
