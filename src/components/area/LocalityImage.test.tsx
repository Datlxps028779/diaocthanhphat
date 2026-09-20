import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LocalityImage } from './LocalityImage';

beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

describe('locality image presentation', () => {
  it('keeps a neutral placeholder when no image exists', () => {
    const html = renderToStaticMarkup(<LocalityImage src={null} alt="Bài viết" className="aspect-[4/3]" />);
    expect(html).toContain('Ảnh chưa có sẵn');
    expect(html).toContain('aspect-[4/3]');
    expect(html).not.toContain('<img');
  });
  it('retains the image alt and a stable frame without inventing a fallback photo', () => {
    const html = renderToStaticMarkup(<LocalityImage src="/hinh-anh/public-media/news/article.jpg" alt="Bài viết địa phương" className="aspect-[4/3]" />);
    expect(html).toContain('alt="Bài viết địa phương"');
    expect(html).toContain('/hinh-anh/public-media/news/article.jpg');
    expect(html).not.toContain('pexels');
  });
  it('uses the same-origin proxy for branded and legacy storage images', () => {
    for (const src of ['https://chonhaviet.com/hinh-anh/public-media/news/article.jpg', 'https://demo.supabase.co/storage/v1/object/public/public-media/news/article.jpg']) {
      const html = renderToStaticMarkup(<LocalityImage src={src} alt="Tin tức" />);
      expect(html).toContain('src="/hinh-anh/public-media/news/article.jpg"');
      expect(html).not.toContain('src="https://chonhaviet.com');
    }
  });
  it('preserves root-relative static image paths', () => {
    const html = renderToStaticMarkup(<LocalityImage src="/images/local.jpg" alt="Tin tức" />);
    expect(html).toContain('src="/images/local.jpg"');
  });
  it('does not redirect external image hosts through the internal proxy', () => {
    const html = renderToStaticMarkup(<LocalityImage src="https://images.example.com/article.jpg" alt="Tin tức" />);
    expect(html).toContain('src="https://images.example.com/article.jpg"');
  });
  it('does not render unsupported image schemes', () => {
    const html = renderToStaticMarkup(<LocalityImage src="javascript:alert(1)" alt="Tin tức" />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
  });
});
