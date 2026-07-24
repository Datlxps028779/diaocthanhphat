const TEXT_ALIGN_STYLE = /^\s*text-align:\s*(left|right|center|justify);?\s*$/i;
const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre']);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
const ALLOWED_ATTR = new Set(['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'colspan', 'rowspan']);

export const ARTICLE_SANITIZE = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...ALLOWED_ATTR],
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:https?:|\/)/i,
};

function stripEmptyBlocks(html: string): string {
  return html.replace(/<(h2|h3|h4|p)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '');
}

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .trim();
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isSafeUrl(value: string): boolean {
  return /^(https?:|\/)/i.test(value.trim());
}

function sanitizeAttrs(rawAttrs: string, tag: string): string {
  const attrs: string[] = [];
  const seen = new Set<string>();
  rawAttrs.replace(/([a-zA-Z][\w:-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g, (_m, rawName: string, rawValue: string) => {
    const name = rawName.toLowerCase();
    if (name.startsWith('on') || name.startsWith('data-') || !ALLOWED_ATTR.has(name) || seen.has(name)) return '';
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    value = decodeAttr(value);
    if ((name === 'href' || name === 'src') && !isSafeUrl(value)) return '';
    if (name === 'style' && !TEXT_ALIGN_STYLE.test(value)) return '';
    if (tag !== 'a' && ['href', 'target', 'rel'].includes(name)) return '';
    if (tag !== 'img' && name === 'src') return '';
    seen.add(name);
    attrs.push(`${name}="${escapeAttr(value)}"`);
    return '';
  });
  if (tag === 'a') {
    const targetBlank = attrs.some(a => /^target="_blank"$/i.test(a));
    if (targetBlank && !attrs.some(a => /^rel=/i.test(a))) attrs.push('rel="noopener noreferrer"');
  }
  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

function sanitizeWithTokenizer(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|svg|math)[\s\S]*?>/gi, '')
    .replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (full, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      const closing = /^<\s*\//.test(full);
      if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
      return `<${tag}${sanitizeAttrs(attrs ?? '', tag)}${VOID_TAGS.has(tag) ? '>' : '>'}`;
    });
}

export function sanitizeArticleHtml(raw: string): string {
  return stripEmptyBlocks(sanitizeWithTokenizer(raw));
}
