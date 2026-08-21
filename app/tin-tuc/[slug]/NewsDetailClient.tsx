'use client';
import { NewsPage } from '@/screens/NewsPage';
import { SiteChrome } from '@/components/SiteChrome';
import { useNavigate } from '@/lib/useNavigate';
import type { NewsArticle, NewsListItem } from '@/lib/supabase';

// NewsPage mở chế độ chi tiết khi có articleId. Server resolve slug và truyền luôn
// snapshot để phần nội dung có trong HTML đầu, khớp metadata/JSON-LD.
export function NewsDetailClient({
  article,
  related,
  mostViewed,
  latest,
}: {
  article: NewsArticle;
  related: NewsListItem[];
  mostViewed: NewsListItem[];
  latest: NewsListItem[];
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'news', articleId: article.id }}>
      <NewsPage
        onNavigate={navigate}
        articleId={article.id}
        initialArticle={article}
        initialRelated={related}
        initialMostViewed={mostViewed}
        initialLatest={latest}
      />
    </SiteChrome>
  );
}
