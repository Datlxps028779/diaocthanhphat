import { describe, expect, it } from 'vitest';
import { compareNewsByPublishedAt, newsPublishedAt } from './newsOrdering';

const article = (overrides: Partial<Parameters<typeof compareNewsByPublishedAt>[0]> = {}) => ({
  id: 'news-1',
  published_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('compareNewsByPublishedAt', () => {
  it('ưu tiên bài có published_at gần nhất', () => {
    const newest = article({ id: 'newest', published_at: '2026-09-04T00:00:00.000Z' });
    const older = article({ id: 'older', published_at: '2026-09-03T00:00:00.000Z' });

    expect(compareNewsByPublishedAt(newest, older)).toBeLessThan(0);
  });

  it('fallback về created_at khi published_at bị null', () => {
    const newer = article({ id: 'newer', created_at: '2026-09-04T00:00:00.000Z' });
    const older = article({ id: 'older', created_at: '2026-09-03T00:00:00.000Z' });

    expect(newsPublishedAt(newer)).toBe(newer.created_at);
    expect(compareNewsByPublishedAt(newer, older)).toBeLessThan(0);
  });

  it('dùng id giảm dần khi thời điểm đăng trùng nhau', () => {
    const zulu = article({ id: 'news-z' });
    const alpha = article({ id: 'news-a' });

    expect(compareNewsByPublishedAt(zulu, alpha)).toBeLessThan(0);
  });

  it('không ưu tiên bài thiếu nguồn trong thứ tự ngày', () => {
    const newest = article({ id: 'newest', published_at: '2026-09-04T00:00:00.000Z' });
    const older = article({ id: 'older', published_at: '2026-09-03T00:00:00.000Z' });

    expect(compareNewsByPublishedAt(newest, older)).toBeLessThan(0);
  });
});
