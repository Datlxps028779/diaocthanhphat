import sanitizeHtml from 'sanitize-html';
import { parseVideoMarkerAttributes, serializeVideoMarker } from './videoMedia';

// Dùng sanitize-html (pure JS, htmlparser2) thay isomorphic-dompurify (kéo jsdom →
// html-encoding-sniffer → @exodus/bytes ESM → crash ERR_REQUIRE_ESM trên server
// component/Vercel lambda). Hàm chạy được cả server lẫn client.

const ALLOWED_TAGS = ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre'];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'colspan', 'rowspan'];
const VIDEO_MARKER_ATTRIBUTES = ['data-video-kind', 'data-video-id', 'data-video-src', 'data-video-title', 'data-video-start', 'data-video-poster'];
const IMAGE_MARKER_ATTRIBUTES = ['data-align'];

function cleanVideoMarker(tagName: string, attribs: Record<string, string>) {
  const video = parseVideoMarkerAttributes(attribs);
  if (!video) return { tagName: 'span', attribs: {} };
  const marker = serializeVideoMarker(video);
  const match = marker.match(/^<figure\b([^>]*)>/i);
  const attributes = Object.fromEntries(
    [...(match?.[1].matchAll(/([\w:-]+)="([^"]*)"/g) ?? [])].map((item) => [item[1], item[2]]),
  );
  return { tagName, attribs: attributes };
}

// Giữ export cũ để không phá caller/test đang import.
export const ARTICLE_SANITIZE = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:https?:|\/)/i,
};

// Chỉ cho phép style text-align (chống style injection). Không cho data-* tùy ý:
// chỉ marker video do ứng dụng phát sinh và data-align ảnh được giữ lại.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ALLOWED_ATTR,
    img: [...ALLOWED_ATTR, ...IMAGE_MARKER_ATTRIBUTES],
    figure: [...ALLOWED_ATTR, ...VIDEO_MARKER_ATTRIBUTES],
  },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  // http/https + relative (khớp ALLOWED_URI_REGEXP cũ) — chặn javascript:, data:.
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  transformTags: {
    // target=_blank → ép rel=noopener noreferrer (chống tabnabbing).
    a: (tagName, attribs) => {
      if (attribs.target === '_blank') attribs.rel = 'noopener noreferrer';
      return { tagName, attribs };
    },
    // figure có data-video-* phải vượt qua parser chung; không render raw iframe/video.
    figure: (tagName, attribs) => {
      if (!attribs['data-video-kind']) return { tagName, attribs: {} };
      return cleanVideoMarker(tagName, attribs);
    },
  },
};

// Bỏ heading/đoạn rỗng (h2 rỗng đầu bài AI, đoạn chỉ có &nbsp;/<br>).
function stripEmptyBlocks(html: string): string {
  return html.replace(/<(h2|h3|h4|p)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '');
}

export function sanitizeArticleHtml(raw: string): string {
  const clean = sanitizeHtml(raw, SANITIZE_OPTIONS);
  return stripEmptyBlocks(clean);
}
