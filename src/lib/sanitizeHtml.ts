import DOMPurify from 'isomorphic-dompurify';

const TEXT_ALIGN_STYLE = /^\s*text-align:\s*(left|right|center|justify);?\s*$/i;

let hookRegistered = false;
function ensureHook() {
  if (hookRegistered) return;
  hookRegistered = true;
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style' && !TEXT_ALIGN_STYLE.test(data.attrValue)) {
      data.keepAttr = false;
    }
  });
}

export const ARTICLE_SANITIZE = {
  ALLOWED_TAGS: ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'colspan', 'rowspan'],
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:https?:|\/)/i,
};

export function sanitizeArticleHtml(raw: string): string {
  ensureHook();
  return DOMPurify.sanitize(raw, ARTICLE_SANITIZE);
}
