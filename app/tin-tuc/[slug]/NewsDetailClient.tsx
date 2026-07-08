'use client';
import { NewsPage } from '@/screens/NewsPage';
import { SiteChrome } from '@/components/SiteChrome';
import { useNavigate } from '@/lib/useNavigate';

// NewsPage mở chế độ chi tiết khi có articleId. Server resolve slug → id, truyền vào.
export function NewsDetailClient({ articleId }: { articleId: string }) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'news', articleId }}>
      <NewsPage onNavigate={navigate} articleId={articleId} />
    </SiteChrome>
  );
}
