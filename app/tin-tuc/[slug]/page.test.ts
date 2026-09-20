import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), metadata: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/lib/supabase-server', () => ({
  serverGetNewsByIdOrSlug: mocks.lookup,
  serverGetNewsContextualProperties: vi.fn(),
  serverGetRelatedNews: vi.fn(),
  serverGetSiteSettings: vi.fn(),
  serverGetMostViewedNews: vi.fn(),
  serverGetNews: vi.fn(),
}));
vi.mock('@/lib/seo', () => ({
  buildNewsMetadata: mocks.metadata,
  buildArticleJsonLd: vi.fn(),
  buildBreadcrumbJsonLd: vi.fn(),
}));
vi.mock('@/lib/propertyFaq', () => ({ buildFaqJsonLd: vi.fn() }));
vi.mock('@/components/JsonLdScripts', () => ({ JsonLdScripts: vi.fn() }));
vi.mock('./NewsDetailClient', () => ({ NewsDetailClient: vi.fn() }));

import NewsArticlePage, { generateMetadata } from './page';

beforeEach(() => vi.resetAllMocks());

describe('news detail route slug guard', () => {
  it.each(['bai-viet-', 'bai%20viet', '%20bai-viet', 'bai-viet%20', 'bai%2Fviet', '%E0%A4%A'])(
    'rejects %s before looking up an article or building metadata', async slug => {
      await expect(NewsArticlePage({ params: { slug } })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(await generateMetadata({ params: { slug } })).toEqual({ title: 'Không tìm thấy bài viết' });
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.metadata).not.toHaveBeenCalled();
    },
  );

  it.each(['bai-viet-hop-le', 'a8a2b8d1-a5a6-482b-9cd6-5c539f0140b4'])(
    'preserves lookup for the supported route %s', async slug => {
      const article = { id: 'news-1', slug: 'bai-viet-hop-le' };
      mocks.lookup.mockResolvedValue(article);
      mocks.metadata.mockReturnValue({ title: 'Bài viết hợp lệ' });
      expect(await generateMetadata({ params: { slug } })).toEqual({ title: 'Bài viết hợp lệ' });
      expect(mocks.lookup).toHaveBeenCalledWith(slug);
      expect(mocks.metadata).toHaveBeenCalledWith(article);
    },
  );

  it('keeps not-found behavior for a well-formed slug with no published article', async () => {
    mocks.lookup.mockResolvedValue(null);
    await expect(NewsArticlePage({ params: { slug: 'khong-ton-tai' } })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
