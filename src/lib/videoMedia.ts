import { getSiteUrl } from './siteUrl';

export type VideoMedia =
  | { kind: 'youtube'; videoId: string; title: string; startSeconds?: number }
  | { kind: 'upload'; src: string; title: string; poster?: string; aspectRatio?: number };

export type RichContentSegment =
  | { type: 'html'; html: string }
  | { type: 'video'; video: VideoMedia };

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
const VIDEO_MARKER_RE = /<figure\b([^>]*)>[\s\S]*?<\/figure\s*>/gi;
const ATTRIBUTE_RE = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const MAX_VIDEO_TITLE = 180;
const UPLOADED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'ogg', 'mov']);
const MIN_ASPECT_RATIO = 0.25;
const MAX_ASPECT_RATIO = 4;

function text(value: string | null | undefined, max = MAX_VIDEO_TITLE): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function attributeMap(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE_RE)) {
    const name = match[1].toLowerCase();
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function parseStartSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(?:([0-9]+)h)?(?:([0-9]+)m)?(?:([0-9]+)s?)?$/i);
  if (!match) return undefined;
  const seconds = (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}

function safeHttpsUrl(raw: string | null | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseYoutubeUrl(raw: string | null | undefined, title = 'Video YouTube'): VideoMedia | null {
  const url = safeHttpsUrl(raw);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') id = segments[0] ?? null;
  else if (segments[0] === 'watch') id = url.searchParams.get('v');
  else if (segments[0] === 'embed' || segments[0] === 'shorts') id = segments[1] ?? null;

  if (!id || !YOUTUBE_ID_RE.test(id)) return null;
  const startSeconds = parseStartSeconds(url.searchParams.get('start') ?? url.searchParams.get('t'));
  return { kind: 'youtube', videoId: id, title: text(title) || 'Video YouTube', ...(startSeconds ? { startSeconds } : {}) };
}

function configuredStorageOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const raw of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.VITE_SUPABASE_URL]) {
    const url = safeHttpsUrl(raw);
    if (url) origins.add(url.origin);
  }
  return origins;
}

function uploadedVideoExtension(pathname: string): string | null {
  const extension = pathname.split('.').pop()?.toLowerCase() ?? '';
  return UPLOADED_VIDEO_EXTENSIONS.has(extension) ? extension : null;
}

function parseAspectRatio(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio >= MIN_ASPECT_RATIO && ratio <= MAX_ASPECT_RATIO
    ? Math.round(ratio * 10_000) / 10_000
    : undefined;
}

export function parseUploadedVideoUrl(raw: string | null | undefined, title = 'Video'): VideoMedia | null {
  const url = safeHttpsUrl(raw);
  if (!url || !url.pathname.startsWith('/storage/v1/object/public/public-media/videos/') || !uploadedVideoExtension(url.pathname)) return null;
  const origins = configuredStorageOrigins();
  if (origins.size === 0 || !origins.has(url.origin)) return null;
  return { kind: 'upload', src: url.toString(), title: text(title) || 'Video' };
}

// Dữ liệu cũ ở properties.video_url chưa được ép qua uploader mới. Vẫn chỉ nhận URL
// HTTPS MP4 hoặc YouTube chuẩn để không tạo player từ URL mơ hồ/giả hostname.
export function parseLegacyPropertyVideo(raw: string | null | undefined, title = 'Video BĐS'): VideoMedia | null {
  const youtube = parseYoutubeUrl(raw, title);
  if (youtube) return youtube;
  return parseUploadedVideoUrl(raw, title);
}

export function youtubeEmbedUrl(video: Extract<VideoMedia, { kind: 'youtube' }>): string {
  const start = video.startSeconds ? `?start=${video.startSeconds}` : '';
  return `https://www.youtube-nocookie.com/embed/${video.videoId}${start}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function serializeVideoMarker(video: VideoMedia): string {
  if (video.kind === 'youtube') {
    return `<figure data-video-kind="youtube" data-video-id="${video.videoId}" data-video-title="${escapeAttribute(video.title)}"${video.startSeconds ? ` data-video-start="${video.startSeconds}"` : ''}><figcaption>${escapeAttribute(video.title)}</figcaption></figure>`;
  }
  return `<figure data-video-kind="upload" data-video-src="${escapeAttribute(video.src)}" data-video-title="${escapeAttribute(video.title)}"${video.poster ? ` data-video-poster="${escapeAttribute(video.poster)}"` : ''}${video.aspectRatio ? ` data-video-aspect-ratio="${video.aspectRatio}"` : ''}><figcaption>${escapeAttribute(video.title)}</figcaption></figure>`;
}

export function parseVideoMarkerAttributes(attributes: Record<string, string>): VideoMedia | null {
  const kind = attributes['data-video-kind'];
  const title = text(attributes['data-video-title']) || 'Video';
  if (kind === 'youtube') {
    const id = attributes['data-video-id'] ?? '';
    if (!YOUTUBE_ID_RE.test(id)) return null;
    const start = attributes['data-video-start'];
    const startSeconds = start && /^\d+$/.test(start) ? Number(start) : undefined;
    return { kind, videoId: id, title, ...(startSeconds && startSeconds <= 86_400 ? { startSeconds } : {}) };
  }
  if (kind === 'upload') {
    const video = parseUploadedVideoUrl(attributes['data-video-src'], title);
    if (!video) return null;
    const poster = safeHttpsUrl(attributes['data-video-poster']);
    const trustedPoster = poster && (poster.origin === safeHttpsUrl(getSiteUrl())?.origin || configuredStorageOrigins().has(poster.origin));
    const aspectRatio = parseAspectRatio(attributes['data-video-aspect-ratio']);
    return { ...video, ...(trustedPoster ? { poster: poster.toString() } : {}), ...(aspectRatio ? { aspectRatio } : {}) };
  }
  return null;
}

export function normalizeVideoHtml(raw: string): string {
  return raw.replace(/<iframe\b([^>]*)>(?:[\s\S]*?<\/iframe\s*>|)/gi, (full, rawAttributes: string) => {
    const attributes = attributeMap(rawAttributes);
    const video = parseYoutubeUrl(attributes.src, attributes.title || 'Video YouTube');
    return video ? serializeVideoMarker(video) : full;
  });
}

export function readVideoMarker(rawFigure: string): VideoMedia | null {
  const opening = rawFigure.match(/^<figure\b([^>]*)>/i);
  return opening ? parseVideoMarkerAttributes(attributeMap(opening[1])) : null;
}

export function splitRichContentVideos(html: string): RichContentSegment[] {
  const segments: RichContentSegment[] = [];
  let cursor = 0;
  for (const match of html.matchAll(VIDEO_MARKER_RE)) {
    const video = readVideoMarker(match[0]);
    if (!video || match.index == null) continue;
    if (match.index > cursor) segments.push({ type: 'html', html: html.slice(cursor, match.index) });
    segments.push({ type: 'video', video });
    cursor = match.index + match[0].length;
  }
  if (cursor < html.length) segments.push({ type: 'html', html: html.slice(cursor) });
  return segments.length ? segments : [{ type: 'html', html }];
}

export function firstInlineVideo(html: string): VideoMedia | null {
  return splitRichContentVideos(html).find((segment): segment is Extract<RichContentSegment, { type: 'video' }> => segment.type === 'video')?.video ?? null;
}

const VR_HOSTS = new Set(['kuula.co', 'www.kuula.co', 'panoee.com', 'www.panoee.com']);

export function parseVrTourUrl(raw: string | null | undefined): { href: string; embedUrl: string | null } | null {
  const url = safeHttpsUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!VR_HOSTS.has(host)) return { href: url.toString(), embedUrl: null };

  if (host.endsWith('kuula.co')) {
    if (!url.pathname.startsWith('/e/')) url.pathname = url.pathname.replace(/^\/(?:post|share)\//, '/e/');
  } else if (host.endsWith('panoee.com') && !url.pathname.startsWith('/embed/')) {
    url.pathname = url.pathname.replace(/^\/tour\//, '/embed/tour/');
  }
  return { href: url.toString(), embedUrl: url.toString() };
}

export function isCurrentSiteOrStorageUrl(raw: string): boolean {
  const url = safeHttpsUrl(raw);
  if (!url) return false;
  const site = safeHttpsUrl(getSiteUrl());
  return url.origin === site?.origin || configuredStorageOrigins().has(url.origin);
}
