import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NewsListItem } from '@/lib/supabase';
import { LocalityNewsSection } from './LocalityNewsSection';

beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

function article(id: string, category = 'Thị trường'): NewsListItem {
  return { id, title: `Bài viết ${id}`, slug: id, excerpt: `Mô tả ${id}`, image_url: null, category, author: '', views: 0, focus_keywords: null, geo_area: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}
function render(articles: NewsListItem[]) {
  return renderToStaticMarkup(<LocalityNewsSection areaName="Bình Dương" articles={articles} variant="magazine" />);
}

describe('locality news editorial grid', () => {
  it('omits an empty collection', () => {
    expect(render([])).toBe('');
  });

  it('renders the editorial grid and a separate topic sidebar', () => {
    const html = render([article('1'), article('2'), article('3')]);
    expect(html.match(/<article\b/g)).toHaveLength(3);
    expect(html).toContain('data-testid="locality-news-main"');
    expect(html).toContain('data-layout="editorial-grid"');
    expect(html).toContain('<aside');
    expect(html).toContain('Chủ đề nổi bật');
  });

  it('caps the visible editorial cards at six without inventing articles', () => {
    const articles = Array.from({ length: 12 }, (_, i) => article(String(i), i < 7 ? 'Thị trường' : 'Đầu tư'));
    const html = render(articles);
    expect(html.match(/<article\b/g)).toHaveLength(6);
    for (const item of articles.slice(0, 6)) expect(html).toContain(`>${item.title}</h3>`);
    for (const item of articles.slice(6)) expect(html).not.toContain(`>${item.title}</h3>`);
    expect(html).toContain('Tin tức bất động sản mới nhất tại Bình Dương');
    expect(html).toContain('Cập nhật xu hướng - Nắm bắt cơ hội');
    expect(html).toContain('Người dùng hoàn toàn tin cậy');
  });

  it('uses only categories sourced from the article props', () => {
    const html = render([article('1', 'Tin đô thị'), article('2', 'A & B'), article('3')]);
    expect(html).toContain('Tin đô thị');
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('Phong thủy');
  });

  it('keeps the source array order and values unchanged', () => {
    const articles = [article('2', 'B'), article('1', 'A')];
    const before = JSON.stringify(articles);
    const html = render(articles);
    expect(JSON.stringify(articles)).toBe(before);
    expect(html.indexOf('href="/tin-tuc/2"')).toBeLessThan(html.indexOf('href="/tin-tuc/1"'));
  });

  it('keeps teaser navigation as a compact strip without editorial grid duplication', () => {
    const html = renderToStaticMarkup(<LocalityNewsSection areaName="Bình Dương" articles={[article('1')]} newsPath="/khu-vuc/binh-duong/tin-tuc" />);
    expect(html).toContain('data-variant="teaser"');
    expect(html).toContain('aria-labelledby="locality-news"');
    expect(html).toContain('href="/khu-vuc/binh-duong/tin-tuc"');
    expect(html).toContain('data-testid="locality-news-strip"');
    expect(html).not.toContain('data-layout="editorial-grid"');
    expect(html).not.toContain('<aside');
  });

  it('does not invent ranking, pagination, or action buttons', () => {
    const html = render([article('only')]);
    expect(html).not.toContain('Đọc nhiều nhất');
    expect(html).not.toContain('lượt xem');
    expect(html).not.toContain('Tải thêm');
    expect(html).not.toContain('<button');
    expect(html).toContain('href="/tin-tuc/only"');
  });
});
