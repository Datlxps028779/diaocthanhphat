import { describe, expect, it } from 'vitest';
import type { NewsListItem } from './supabase';
import { buildNewsSections, pickSectionArticles } from './newsLayout';

function article(id: string, category: string): NewsListItem {
  return {
    id,
    title: id,
    slug: id,
    excerpt: '',
    image_url: null,
    category,
    author: '',
    views: 0,
    focus_keywords: null,
    geo_area: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('pickSectionArticles', () => {
  it('ưu tiên bài không nằm trong hero và giới hạn đúng số lượng', () => {
    const rows = [article('hero', 'A'), article('a1', 'A'), article('a2', 'A'), article('a3', 'A')];
    expect(pickSectionArticles(rows, new Set(['hero']), 2).map(a => a.id)).toEqual(['a1', 'a2']);
  });

  it('dùng lại bài hero khi danh mục chỉ có bài đó', () => {
    const rows = [article('hero', 'Đầu tư')];
    expect(pickSectionArticles(rows, new Set(['hero']), 4).map(a => a.id)).toEqual(['hero']);
  });

  it('không dùng bài hero để lấp thêm khi đã có bài ngoài hero', () => {
    const rows = [article('hero', 'A'), article('a1', 'A')];
    expect(pickSectionArticles(rows, new Set(['hero']), 4).map(a => a.id)).toEqual(['a1']);
  });
});

describe('buildNewsSections', () => {
  it('giữ đúng thứ tự admin và bỏ danh mục không có bài', () => {
    const byCategory = new Map<string, NewsListItem[]>([
      ['Đầu tư', [article('d1', 'Đầu tư')]],
      ['Thị trường', [article('t1', 'Thị trường')]],
      ['Hướng dẫn', []],
    ]);
    const result = buildNewsSections(['Đầu tư', 'Hướng dẫn', 'Thị trường'], byCategory, new Set(), 4);
    expect(result.map(section => section.category)).toEqual(['Đầu tư', 'Thị trường']);
  });

  it('không đưa danh mục không được admin chọn vào kết quả', () => {
    const byCategory = new Map<string, NewsListItem[]>([
      ['Ẩn', [article('x1', 'Ẩn')]],
      ['Hiện', [article('h1', 'Hiện')]],
    ]);
    expect(buildNewsSections(['Hiện'], byCategory, new Set()).map(s => s.category)).toEqual(['Hiện']);
  });
});
