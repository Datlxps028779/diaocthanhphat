import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateLocalityNews, LOCALITY_NEWS_SNAPSHOT_TAG, loadLocalityNewsSnapshot } from './localityNewsSnapshot';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}));

type Row = Record<string, unknown>;
const newsRow = (id: string, extra: Row = {}): Row => ({
  id,
  title: `Bài ${id}`,
  slug: `bai-${id}`,
  excerpt: null,
  image_url: null,
  category: 'Thị trường',
  author: 'Toà soạn',
  views: 0,
  focus_keywords: null,
  geo_area: null,
  area_id: 'a-bd',
  district_id: null,
  ward_id: null,
  is_published: true,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...extra,
});

function page(rows: Row[], count: number, start = 0) {
  const last = rows.length ? start + rows.length - 1 : null;
  return new Response(JSON.stringify(rows), {
    headers: { 'content-range': `${last === null ? '*' : `${start}-${last}`}/${count}`, 'content-type': 'application/json' },
  });
}

const options = (fetcher: typeof fetch, extra: Row = {}) => ({
  fetcher, url: 'https://public.example', anonKey: 'anon-key', ...extra,
});

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('loadLocalityNewsSnapshot', () => {
  it('reads published news through the bounded transport with a public-only projection', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([newsRow('a')], 1))
      .mockResolvedValueOnce(page([newsRow('a')], 1));
    const rows = await loadLocalityNewsSnapshot(options(fetcher, { pageSize: 500 }));
    expect(rows.map(entry => entry.id)).toEqual(['a']);
    for (const [input] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/rest/v1/news');
      expect(url.searchParams.get('is_published')).toBe('eq.true');
      expect(url.searchParams.get('order')).toBe('id.asc');
      const select = url.searchParams.get('select') ?? '';
      for (const field of ['id', 'title', 'slug', 'excerpt', 'image_url', 'category', 'author', 'views', 'focus_keywords', 'geo_area', 'area_id', 'district_id', 'ward_id', 'created_at', 'updated_at']) {
        expect(select).toContain(field);
      }
      // Parity with the search-visibility source select.
      expect(select).toContain('is_published');
      for (const forbidden of ['content', 'schema_markup', 'faq', 'citations', 'reviewer_name', 'gemini', 'source_note']) {
        expect(select).not.toContain(forbidden);
      }
    }
  });

  it('never lets an unexpected private column reach the returned snapshot', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([newsRow('a', { reviewer_name: 'secret-reviewer', source_note: 'secret-note' })], 1))
      .mockResolvedValueOnce(page([newsRow('a')], 1));
    const serialized = JSON.stringify(await loadLocalityNewsSnapshot(options(fetcher)));
    for (const secret of ['secret-reviewer', 'secret-note', 'reviewer_name', 'source_note']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('fails closed rather than returning a truncated snapshot when the ceiling is exceeded', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(page([newsRow('a')], 6000));
    await expect(loadLocalityNewsSnapshot(options(fetcher, { maxRows: 5000 })))
      .rejects.toThrow(/^Locality news snapshot unavailable$/);
  });

  it('fails closed on a malformed news row instead of publishing a partial list', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(page([newsRow('a', { is_published: 'yes' })], 1));
    await expect(loadLocalityNewsSnapshot(options(fetcher)))
      .rejects.toThrow(/^Locality news snapshot unavailable$/);
  });

  it('retains matching fields across loader then evaluator, including structured-only news', async () => {
    const source = ['a', 'b', 'c'].map(id => newsRow(id));
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page(source, 3))
      .mockResolvedValueOnce(page([source[0]], 3));
    const loaded = await loadLocalityNewsSnapshot(options(fetcher));
    expect(evaluateLocalityNews(loaded, 'a-bd', [], 1)).toMatchObject({ total: 3, indexable: true });
  });

  it('exposes a fixed cache tag for locality news invalidation', () => {
    expect(LOCALITY_NEWS_SNAPSHOT_TAG).toBe('public-locality-news-snapshot');
  });
});

describe('evaluateLocalityNews', () => {
  // Exactly the NewsListItem public shape — no is_published / area_id / district_id /
  // ward_id, because those drive matching and must not leak to the UI payload.
  const allow = ['id', 'title', 'slug', 'excerpt', 'image_url', 'category', 'author', 'views', 'focus_keywords', 'geo_area', 'created_at', 'updated_at'] as const;
  const evaluate = (rows: Row[], limit?: number) =>
    evaluateLocalityNews(rows, 'a-bd', ['Bình Dương'], limit);

  it('matches structured area ids and exact normalized geo areas, never substrings', async () => {
    const result = evaluate([
      newsRow('structured', { area_id: 'a-bd' }),
      newsRow('geoed', { area_id: null, geo_area: '  Bình   Dương ' }),
      newsRow('substring', { area_id: null, geo_area: 'Bình Dương và Đồng Nai' }),
      newsRow('elsewhere', { area_id: 'a-other', geo_area: null }),
    ]);
    expect(result.data.map(entry => entry.id)).toEqual(['structured', 'geoed']);
    expect(result.total).toBe(2);
  });

  it('ignores unpublished rows even when they match geography', async () => {
    const result = evaluate([
      newsRow('published'),
      newsRow('draft', { is_published: false }),
    ]);
    expect(result.data.map(entry => entry.id)).toEqual(['published']);
    expect(result.total).toBe(1);
  });

  it('dedupes globally by id before ordering, so duplicates never inflate the total', async () => {
    const result = evaluate([
      newsRow('a', { created_at: '2026-09-01T00:00:00.000Z' }),
      newsRow('b', { created_at: '2026-09-02T00:00:00.000Z' }),
      newsRow('a', { created_at: '2026-09-03T00:00:00.000Z' }),
      newsRow('b', { created_at: '2026-09-04T00:00:00.000Z' }),
    ]);
    expect(result.data.map(entry => entry.id)).toEqual(['b', 'a']);
    expect(result.total).toBe(2);
  });

  it('orders by created_at desc then id desc regardless of the source row order', async () => {
    const rows = [
      newsRow('a', { created_at: '2026-09-01T00:00:00.000Z' }),
      newsRow('c', { created_at: '2026-09-03T00:00:00.000Z' }),
      newsRow('b', { created_at: '2026-09-02T00:00:00.000Z' }),
      newsRow('d', { created_at: '2026-09-02T00:00:00.000Z' }),
    ];
    expect(evaluate(rows).data.map(entry => entry.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(evaluate([...rows].reverse()).data.map(entry => entry.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('slices only the display page while computing total and indexable from the complete matched set', async () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      newsRow(`n${String(index).padStart(2, '0')}`, { created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }));
    const result = evaluate(rows, 5);
    expect(result.data).toHaveLength(5);
    expect(result.data.map(entry => entry.id)).toEqual(['n19', 'n18', 'n17', 'n16', 'n15']);
    // total/indexable must not be clipped by the display limit.
    expect(result.total).toBe(20);
    expect(result.indexable).toBe(true);
  });

  it('keeps indexable false below the minimum and true exactly at it', async () => {
    const two = evaluate([newsRow('a'), newsRow('b')]);
    expect(two.total).toBe(2);
    expect(two.indexable).toBe(false);

    const three = evaluate([newsRow('a'), newsRow('b'), newsRow('c'), newsRow('d')], 2);
    expect(three.data).toHaveLength(2);
    expect(three.total).toBe(4);
    expect(three.indexable).toBe(true);
  });

  it('projects only allowlisted fields so private columns cannot leak', async () => {
    const result = evaluate([newsRow('a', { reviewer_name: 'secret-reviewer', content: 'secret-body' })]);
    expect(Object.keys(result.data[0]).sort()).toEqual([...allow].sort());
    expect(JSON.stringify(result)).not.toContain('secret-');
  });

  it('fails closed on invalid inputs rather than silently widening the match', async () => {
    expect(() => evaluate([newsRow('a')], 0)).toThrow(/Locality news snapshot unavailable/);
    expect(() => evaluateLocalityNews([newsRow('a')], '', ['Bình Dương'])).toThrow(/Locality news snapshot unavailable/);
  });
});
