import type { ReactNode } from 'react';

export function safeUrl(url: string) {
  const value = url.trim();
  if (!value) return '';
  if (value.startsWith('/')) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

export function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) nodes.push(<strong key={`bold-${match.index}`}>{match[2]}</strong>);
    else if (match[3]) nodes.push(<em key={`italic-${match.index}`}>{match[3]}</em>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const HTML_BLOCK_TAG = /<\/?(p|h[1-6]|ul|ol|li|blockquote|img|figure|figcaption|a|strong|em|b|i|br|div|span)\b[^>]*>/i;

export function isHtmlContent(value: string): boolean {
  return HTML_BLOCK_TAG.test(value);
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdownToHtml(text: string): string {
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let html = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) html += escapeHtml(text.slice(lastIndex, match.index));
    if (match[2]) html += `<strong>${escapeHtml(match[2])}</strong>`;
    else if (match[3]) html += `<em>${escapeHtml(match[3])}</em>`;
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) html += escapeHtml(text.slice(lastIndex));
  return html;
}

export function markdownToHtml(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let i = 0;

  const isBlockStart = (value: string) =>
    /^#{1,3}\s+/.test(value) || /^>\s?/.test(value) || /^!\[[^\]]*\]\([^\)]+\)$/.test(value) || /^[-*]\s+/.test(value);

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#{1,3}/)?.[0].length ?? 2;
      const text = line.replace(/^#{1,3}\s+/, '').trim();
      const tag = level === 1 ? 'h2' : level === 2 ? 'h2' : 'h3';
      blocks.push(`<${tag}>${inlineMarkdownToHtml(text)}</${tag}>`);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, '').trim());
        i++;
      }
      blocks.push(`<blockquote>${inlineMarkdownToHtml(quoteLines.join(' ').trim())}</blockquote>`);
      continue;
    }

    if (/^!\[[^\]]*\]\([^\)]+\)$/.test(line)) {
      const match = line.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/);
      const src = match ? safeUrl(match[2]) : '';
      if (src) blocks.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(match?.[1] || '')}" />`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, '').trim());
        i++;
      }
      blocks.push(`<ul>${items.map(item => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</ul>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (!current || isBlockStart(current)) break;
      paragraphLines.push(lines[i].trim());
      i++;
    }
    const text = paragraphLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text) blocks.push(`<p>${inlineMarkdownToHtml(text)}</p>`);
    else if (!paragraphLines.length) i++;
  }

  return blocks.join('');
}

export function renderMarkdownContent(content: string) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  const isBlockStart = (value: string) =>
    /^#{1,3}\s+/.test(value) || /^>\s?/.test(value) || /^!\[[^\]]*\]\([^\)]+\)$/.test(value) || /^[-*]\s+/.test(value);

  const pushParagraph = (paragraphLines: string[], key: string) => {
    const text = paragraphLines.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    blocks.push(
      <p key={key} className="m-0">
        {renderInlineMarkdown(text)}
      </p>,
    );
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#{1,3}/)?.[0].length ?? 2;
      const text = line.replace(/^#{1,3}\s+/, '').trim();
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
      blocks.push(
        <Tag
          key={`heading-${i}`}
          className={level === 1 ? 'mt-2 text-2xl font-bold text-gray-900' : level === 2 ? 'mt-2 text-xl font-bold text-gray-900' : 'mt-2 text-lg font-semibold text-gray-900'}
        >
          {renderInlineMarkdown(text)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, '').trim());
        i++;
      }
      blocks.push(
        <blockquote key={`quote-${i}`} className="rounded-xl border-l-4 border-red-400 bg-red-50 px-4 py-3 text-gray-700">
          {renderInlineMarkdown(quoteLines.join(' ').trim())}
        </blockquote>,
      );
      continue;
    }

    if (/^!\[[^\]]*\]\([^\)]+\)$/.test(line)) {
      const match = line.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/);
      const src = match ? safeUrl(match[2]) : '';
      if (src) {
        blocks.push(
          <figure key={`img-${i}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <img src={src} alt={match?.[1] || ''} className="h-auto w-full object-cover" />
          </figure>,
        );
      }
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, '').trim());
        i++;
      }
      blocks.push(
        <ul key={`list-${i}`} className="list-disc space-y-2 pl-5">
          {items.map((item, index) => <li key={`${i}-${index}`}>{renderInlineMarkdown(item)}</li>)}
        </ul>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (!current || isBlockStart(current)) break;
      paragraphLines.push(lines[i].trim());
      i++;
    }
    pushParagraph(paragraphLines, `p-${i}`);
    if (!paragraphLines.length) i++;
  }

  return blocks.length > 0 ? blocks : <p className="m-0 text-gray-500">Chưa có nội dung.</p>;
}
