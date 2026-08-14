import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  firstInlineVideo,
  parseLegacyPropertyVideo,
  parseUploadedVideoUrl,
  parseVideoMarkerAttributes,
  parseVrTourUrl,
  parseYoutubeUrl,
  serializeVideoMarker,
  splitRichContentVideos,
  youtubeEmbedUrl,
} from './videoMedia';

describe('video media', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    'https://www.youtube.com/watch?v=abc123XYZ_1',
    'https://youtu.be/abc123XYZ_1',
    'https://www.youtube.com/embed/abc123XYZ_1',
    'https://www.youtube.com/shorts/abc123XYZ_1',
  ])('parses trusted YouTube URL %s', url => {
    const video = parseYoutubeUrl(url, ' Tour nhà ');
    expect(video).toMatchObject({ kind: 'youtube', videoId: 'abc123XYZ_1', title: 'Tour nhà' });
  });

  it('canonicalizes a YouTube embed to nocookie and preserves a valid start time', () => {
    const video = parseYoutubeUrl('https://youtu.be/abc123XYZ_1?t=1m5s');
    expect(video).toMatchObject({ kind: 'youtube', startSeconds: 65 });
    expect(youtubeEmbedUrl(video! as Extract<typeof video, { kind: 'youtube' }>)).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ_1?start=65',
    );
  });

  it.each([
    'http://www.youtube.com/watch?v=abc123XYZ_1',
    'https://youtube.com.evil.test/watch?v=abc123XYZ_1',
    'https://www.youtube.com/watch?v=too-short',
    'javascript:alert(1)',
    'data:text/html,hello',
    '//youtube.com/watch?v=abc123XYZ_1',
    'https://www.youtube.com.evil.test/embed/abc123XYZ_1',
    'https://user:pass@www.youtube.com/watch?v=abc123XYZ_1',
    'https://www.youtube.com:8443/watch?v=abc123XYZ_1',
  ])('rejects untrusted YouTube URL %s', url => {
    expect(parseYoutubeUrl(url)).toBeNull();
  });

  it('accepts only a configured direct public-media MP4 upload', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(parseUploadedVideoUrl(
      'https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.mp4',
      'Video thực tế',
    )).toEqual({
      kind: 'upload',
      src: 'https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.mp4',
      title: 'Video thực tế',
    });
  });

  it.each([
    'https://evil.test/storage/v1/object/public/public-media/videos/properties/house.mp4',
    'https://example.supabase.co/storage/v1/object/public/public-media/images/house.mp4',
    'https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.webm',
    'http://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.mp4',
  ])('rejects an upload URL outside the strict allowlist: %s', url => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(parseUploadedVideoUrl(url)).toBeNull();
  });

  it('keeps only configured legacy MP4 and rejects unapproved origins', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(parseLegacyPropertyVideo('https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/tour.mp4')).toMatchObject({ kind: 'upload' });
    expect(parseLegacyPropertyVideo('https://cdn.example.test/tour.mp4')).toBeNull();
    expect(parseLegacyPropertyVideo('https://youtube.com.evil.test/tour.mp4')).toBeNull();
    expect(parseLegacyPropertyVideo('javascript:alert(1)')).toBeNull();
  });

  it('round-trips a trusted marker and extracts it from rich content', () => {
    const marker = serializeVideoMarker({ kind: 'youtube', videoId: 'abc123XYZ_1', title: 'Video nhà', startSeconds: 42 });
    const segments = splitRichContentVideos(`<p>Mở đầu</p>${marker}<p>Kết thúc</p>`);
    expect(segments).toHaveLength(3);
    expect(segments[1]).toEqual({ type: 'video', video: { kind: 'youtube', videoId: 'abc123XYZ_1', title: 'Video nhà', startSeconds: 42 } });
    expect(firstInlineVideo(`${marker}<p>Khác</p>`)).toMatchObject({ videoId: 'abc123XYZ_1' });
  });

  it('rejects forged structured marker attributes', () => {
    expect(parseVideoMarkerAttributes({
      'data-video-kind': 'youtube',
      'data-video-id': 'not-valid',
      'data-video-title': 'X',
    })).toBeNull();
    expect(parseVideoMarkerAttributes({
      'data-video-kind': 'upload',
      'data-video-src': 'https://evil.test/file.mp4',
    })).toBeNull();
  });

  it('drops an uploaded-video poster outside trusted origins', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    const video = parseVideoMarkerAttributes({
      'data-video-kind': 'upload',
      'data-video-src': 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.mp4',
      'data-video-poster': 'https://evil.test/tracker.jpg',
    });
    expect(video).toEqual({
      kind: 'upload',
      src: 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.mp4',
      title: 'Video',
    });
  });

  it('embeds only approved VR hosts and leaves an unknown HTTPS provider link-only', () => {
    expect(parseVrTourUrl('https://kuula.co/post/abc')).toEqual({
      href: 'https://kuula.co/e/abc',
      embedUrl: 'https://kuula.co/e/abc',
    });
    expect(parseVrTourUrl('https://evil-kuula.co/post/abc')).toEqual({
      href: 'https://evil-kuula.co/post/abc',
      embedUrl: null,
    });
    expect(parseVrTourUrl('javascript:alert(1)')).toBeNull();
  });
});
