import { describe, expect, it, vi } from 'vitest';
import {
  firstInlineVideo,
  parseLegacyPropertyVideo,
  parseUploadedVideoUrl,
  parseVideoMarkerAttributes,
  parseVrTourUrl,
  parseYoutubeUrl,
  readVideoMarker,
  serializeVideoMarker,
  splitRichContentVideos,
} from './videoMedia';

describe('video media', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc123XYZ_1',
    'https://youtu.be/abc123XYZ_1',
    'https://www.youtube.com/embed/abc123XYZ_1',
    'https://www.youtube.com/shorts/abc123XYZ_1',
  ])('parses strict YouTube URL %s', url => {
    expect(parseYoutubeUrl(url, 'Video nhà')).toMatchObject({
      kind: 'youtube', videoId: 'abc123XYZ_1', title: 'Video nhà',
    });
  });

  it('normalizes YouTube start time', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=abc123XYZ_1&t=1m42s')).toMatchObject({ startSeconds: 102 });
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

  it('accepts configured direct public-media video uploads', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    for (const extension of ['mp4', 'webm', 'mov', 'ogv', 'ogg']) {
      const video = parseUploadedVideoUrl(`https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.${extension}`, 'Video thực tế');
      expect(video).toMatchObject({ kind: 'upload', title: 'Video thực tế' });
    }
  });

  it('keeps a trusted aspect ratio within safe bounds', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(parseVideoMarkerAttributes({
      'data-video-kind': 'upload',
      'data-video-src': 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.mp4',
      'data-video-aspect-ratio': '1.7778',
    })).toMatchObject({ kind: 'upload', aspectRatio: 1.7778 });
    expect(parseVideoMarkerAttributes({
      'data-video-kind': 'upload',
      'data-video-src': 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.mp4',
      'data-video-aspect-ratio': '99',
    })).not.toHaveProperty('aspectRatio');
  });

  it('round-trips uploaded video format and aspect ratio marker', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    const marker = serializeVideoMarker({
      kind: 'upload',
      src: 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.webm',
      title: 'Tour', aspectRatio: 1.5,
    });
    expect(readVideoMarker(marker)).toMatchObject({ kind: 'upload', aspectRatio: 1.5, title: 'Tour' });
  });

  it.each([
    'https://evil.test/storage/v1/object/public/public-media/videos/properties/house.mp4',
    'https://example.supabase.co/storage/v1/object/public/public-media/images/house.mp4',
    'https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.exe',
    'http://example.supabase.co/storage/v1/object/public/public-media/videos/properties/house.mp4',
  ])('rejects an upload URL outside the strict allowlist: %s', url => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(parseUploadedVideoUrl(url)).toBeNull();
  });

  it('keeps only configured legacy video and rejects unapproved origins', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    expect(parseLegacyPropertyVideo('https://example.supabase.co/storage/v1/object/public/public-media/videos/properties/tour.webm')).toMatchObject({ kind: 'upload' });
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
    expect(parseVideoMarkerAttributes({ 'data-video-kind': 'youtube', 'data-video-id': 'not-valid', 'data-video-title': 'X' })).toBeNull();
    expect(parseVideoMarkerAttributes({ 'data-video-kind': 'upload', 'data-video-src': 'https://evil.test/file.mp4' })).toBeNull();
  });

  it('drops an uploaded-video poster outside trusted origins', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    const video = parseVideoMarkerAttributes({
      'data-video-kind': 'upload',
      'data-video-src': 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.mp4',
      'data-video-poster': 'https://evil.test/tracker.jpg',
    });
    expect(video).toEqual({ kind: 'upload', src: 'https://example.supabase.co/storage/v1/object/public/public-media/videos/news/tour.mp4', title: 'Video' });
  });

  it('embeds only approved VR hosts and leaves an unknown HTTPS provider link-only', () => {
    expect(parseVrTourUrl('https://kuula.co/post/abc')).toEqual({ href: 'https://kuula.co/e/abc', embedUrl: 'https://kuula.co/e/abc' });
    expect(parseVrTourUrl('https://evil-kuula.co/post/abc')).toEqual({ href: 'https://evil-kuula.co/post/abc', embedUrl: null });
    expect(parseVrTourUrl('javascript:alert(1)')).toBeNull();
  });
});
