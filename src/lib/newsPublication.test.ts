import { describe, expect, it } from 'vitest';
import {
  ensureNewsPublicationTimestamp,
  getNewsIdsToStampOnBulkPublish,
} from './api/news';

describe('news publication timestamp', () => {
  const now = '2026-09-05T10:00:00.000Z';

  it('stamps a newly created public article without overwriting the publication flag', () => {
    const result = ensureNewsPublicationTimestamp(undefined, {
      is_published: true,
      published_at: null,
    }, now);

    expect(result).toEqual({ is_published: true, published_at: now });
  });

  it('does not publish drafts or assign a timestamp to them', () => {
    const result = ensureNewsPublicationTimestamp(undefined, {
      is_published: false,
      published_at: null,
    }, now);

    expect(result).toEqual({ is_published: false, published_at: null });
  });

  it('stamps a draft-to-public transition when no timestamp exists', () => {
    const result = ensureNewsPublicationTimestamp({
      is_published: false,
      published_at: null,
    }, { is_published: true }, now);

    expect(result.published_at).toBe(now);
  });

  it('keeps an existing publication timestamp when a public article is edited', () => {
    const publishedAt = '2026-08-20T08:00:00.000Z';
    const result = ensureNewsPublicationTimestamp({
      is_published: true,
      published_at: publishedAt,
    }, { title: 'Tiêu đề mới' }, now);

    expect(result).toEqual({ title: 'Tiêu đề mới', published_at: publishedAt });
  });

  it('keeps an explicit historical timestamp during publication', () => {
    const publishedAt = '2025-12-01T08:00:00.000Z';
    const result = ensureNewsPublicationTimestamp({
      is_published: false,
      published_at: null,
    }, { is_published: true, published_at: publishedAt }, now);

    expect(result.published_at).toBe(publishedAt);
  });

  it('does not clear the timestamp when an article is unpublished', () => {
    const publishedAt = '2026-08-20T08:00:00.000Z';
    const result = ensureNewsPublicationTimestamp({
      is_published: true,
      published_at: publishedAt,
    }, { is_published: false, published_at: null }, now);

    expect(result.published_at).toBe(publishedAt);
  });

  it('selects only draft rows without timestamps for bulk publish stamping', () => {
    expect(getNewsIdsToStampOnBulkPublish([
      { id: 'draft-missing', is_published: false, published_at: null },
      { id: 'draft-dated', is_published: false, published_at: '2026-08-01T00:00:00.000Z' },
      { id: 'published-missing', is_published: true, published_at: null },
      { id: 'published-dated', is_published: true, published_at: '2026-08-02T00:00:00.000Z' },
    ])).toEqual(['draft-missing']);
  });
});
