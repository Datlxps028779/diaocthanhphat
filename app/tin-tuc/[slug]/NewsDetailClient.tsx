'use client';
import { NewsPage } from '@/screens/NewsPage';
import { SiteChrome } from '@/components/SiteChrome';
import { useNavigate } from '@/lib/useNavigate';
import type { NewsArticle } from '@/lib/supabase';

// NewsPage mở chế độ chi tiết khi có articleId. Server resolve slug và truyền luôn
// snapshot để phần nội dung có trong HTML đầu, khớp metadata/JSON-LD.
export function NewsDetailClient({ article }: { article: NewsArticle }) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'news', articleId: article.id }}>
      <NewsPage onNavigate={navigate} articleId={article.id} initialArticle={article} />
    </SiteChrome>
  );
}
