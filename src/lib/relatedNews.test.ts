import { describe, it, expect } from 'vitest';
import { pickRelated, relatedScore, keywordSet } from './relatedNews';
import type { NewsArticle } from './supabase';

const NOW = new Date('2026-07-19T00:00:00Z').getTime();

const article = (o: Partial<NewsArticle> & { id: string }): NewsArticle => ({
  title: o.id, slug: o.id, excerpt: null, content: null, image_url: null,
  category: 'Thị trường', author: 'Ban biên tập', is_published: true, views: 0,
  meta_title: null, meta_description: null, focus_keywords: null, schema_markup: null,
  related_ids: null, geo_area: null, geo_entity: null, geo_notes: null, faq: null, citations: null, created_at: '2026-07-18T00:00:00Z', updated_at: '2026-07-18T00:00:00Z',
  ...o,
});

describe('keywordSet', () => {
  it('tách, trim, lowercase, bỏ rỗng', () => {
    expect([...keywordSet({ focus_keywords: 'Nhà, Đất ,  , CĂN HỘ' })]).toEqual(['nhà', 'đất', 'căn hộ']);
    expect(keywordSet({ focus_keywords: null }).size).toBe(0);
  });
});

describe('relatedScore', () => {
  it('cùng category +5', () => {
    const cur = article({ id: 'a', category: 'Hạ tầng' });
    const same = article({ id: 'b', category: 'Hạ tầng' });
    const diff = article({ id: 'c', category: 'Đầu tư' });
    expect(relatedScore(cur, same, NOW)).toBeGreaterThan(relatedScore(cur, diff, NOW));
  });

  it('mỗi keyword trùng +3', () => {
    const cur = article({ id: 'a', category: 'X', focus_keywords: 'metro, dĩ an' });
    const overlap2 = article({ id: 'b', category: 'X', focus_keywords: 'metro, dĩ an' });
    const overlap0 = article({ id: 'c', category: 'X', focus_keywords: 'khác' });
    expect(relatedScore(cur, overlap2, NOW) - relatedScore(cur, overlap0, NOW)).toBeCloseTo(6, 5);
  });
});

describe('pickRelated', () => {
  const cur = article({ id: 'cur', category: 'Hạ tầng', focus_keywords: 'metro' });

  it('bài chọn tay lên trước theo đúng thứ tự', () => {
    const pool = [article({ id: 'x' }), article({ id: 'y' }), article({ id: 'z' })];
    const out = pickRelated(cur, ['z', 'x'], pool, 5, NOW);
    expect(out.slice(0, 2).map(a => a.id)).toEqual(['z', 'x']);
  });

  it('tự động bù theo score khi thiếu', () => {
    const pool = [
      article({ id: 'match', category: 'Hạ tầng', focus_keywords: 'metro' }),
      article({ id: 'nomatch', category: 'Đầu tư', focus_keywords: 'khác' }),
    ];
    const out = pickRelated(cur, [], pool, 5, NOW);
    expect(out[0].id).toBe('match');
  });

  it('loại chính nó và không trùng lặp', () => {
    const pool = [cur, article({ id: 'x' })];
    const out = pickRelated(cur, ['cur', 'x', 'x'], pool, 5, NOW);
    expect(out.map(a => a.id)).toEqual(['x']);
  });

  it('tôn trọng limit', () => {
    const pool = Array.from({ length: 10 }, (_, i) => article({ id: `n${i}` }));
    expect(pickRelated(cur, [], pool, 3, NOW)).toHaveLength(3);
  });

  it('input rỗng trả mảng rỗng', () => {
    expect(pickRelated(cur, [], [], 5, NOW)).toEqual([]);
  });

  it('tie score được sắp xếp ổn định theo ngày tạo rồi id', () => {
    const pool = [
      article({ id: 'z', category: 'Đầu tư', created_at: '2026-07-17T00:00:00Z' }),
      article({ id: 'a', category: 'Đầu tư', created_at: '2026-07-17T00:00:00Z' }),
      article({ id: 'newer', category: 'Đầu tư', created_at: '2026-07-18T00:00:00Z' }),
    ];

    expect(pickRelated(cur, [], pool, 3, NOW).map(a => a.id)).toEqual(['newer', 'a', 'z']);
  });
});

describe('buildArticleDiscoveryPools', () => {
  it('loại bài hiện tại và không lặp một bài giữa các khối', async () => {
    const { buildArticleDiscoveryPools } = await import('./relatedNews');
    const pools = buildArticleDiscoveryPools(
      'current',
      [{ id: 'current' }, { id: 'related-1' }, { id: 'related-2' }, { id: 'related-3' }, { id: 'related-4' }],
      [{ id: 'related-1' }, { id: 'popular-1' }, { id: 'popular-2' }, { id: 'popular-3' }],
      [{ id: 'related-2' }, { id: 'latest-1' }, { id: 'latest-2' }, { id: 'latest-3' }],
    );

    expect(pools.sidebarRelated.map(item => item.id)).toEqual(['related-1', 'related-2', 'related-3']);
    expect(pools.sidebarPopular.map(item => item.id)).toEqual(['popular-1', 'popular-2', 'popular-3']);
    expect(pools.continuation.map(item => item.id)).toEqual(['related-4', 'latest-1', 'latest-2', 'latest-3']);
    expect(pools.mobileContinuation.map(item => item.id)).toEqual([
      'related-1', 'related-2', 'related-3', 'popular-1', 'popular-2', 'popular-3',
    ]);
    expect(new Set([...pools.sidebarRelated, ...pools.sidebarPopular, ...pools.continuation].map(item => item.id)).size).toBe(10);
  });

  it('keeps sidebar-only related and popular articles in the mobile continuation', async () => {
    const { buildArticleDiscoveryPools } = await import('./relatedNews');
    const pools = buildArticleDiscoveryPools(
      'current',
      [{ id: 'related-1' }, { id: 'related-2' }],
      [{ id: 'popular-1' }, { id: 'popular-2' }],
      [{ id: 'latest-1' }, { id: 'latest-2' }],
    );

    expect(pools.mobileContinuation.map(item => item.id)).toEqual([
      'related-1', 'related-2', 'popular-1', 'popular-2', 'latest-1', 'latest-2',
    ]);
    expect(pools.mobileContinuation).toHaveLength(6);
    expect(new Set(pools.mobileContinuation.map(item => item.id)).size).toBe(pools.mobileContinuation.length);
    expect(pools.mobileContinuation.map(item => item.id)).not.toContain('current');
  });
});
