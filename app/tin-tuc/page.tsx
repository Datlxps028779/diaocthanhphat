import type { Metadata } from 'next';
import { NewsListClient } from '../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Tin tức thị trường bất động sản',
  description: 'Tin tức, phân tích thị trường bất động sản, quy hoạch, hạ tầng tại Bình Dương và khu vực lân cận.',
  path: '/tin-tuc',
});
export const revalidate = 1800;

export default async function Page() {
  const articles = await serverGetNews();
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Tin tức thị trường bất động sản', path: '/tin-tuc' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <NewsListClient initialArticles={articles} />
    </>
  );
}
