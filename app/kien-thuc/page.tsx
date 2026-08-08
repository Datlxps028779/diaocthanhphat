import type { Metadata } from 'next';
import { NewsListClient } from '../_clients/pageClients';
import { serverGetNewsPage, serverGetMostViewedNews } from '@/lib/supabase-server';
import { loadRouteSeo, type RouteFallback } from '@/lib/routeSeo';
import { JsonLdScripts } from '@/components/JsonLdScripts';

export const revalidate = 1800;

const PATH = '/kien-thuc';
const CATEGORY = 'Hướng dẫn'; // cluster kiến thức dùng chung danh mục "Hướng dẫn" của news

const fallback: RouteFallback = {
  title: 'Kiến thức bất động sản',
  description: 'Cẩm nang, hướng dẫn và phân tích chuyên sâu về bất động sản Bình Dương: pháp lý, định giá, kinh nghiệm mua bán và đầu tư.',
  path: PATH,
  routeType: 'CollectionPage',
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Kiến thức', path: PATH },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}

export default async function KnowledgeHubPage() {
  const [initialPage, initialMostViewed, { jsonLd }] = await Promise.all([
    serverGetNewsPage({ category: CATEGORY }),
    serverGetMostViewedNews(8),
    loadRouteSeo(PATH, fallback),
  ]);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <NewsListClient initialPage={initialPage} initialMostViewed={initialMostViewed} initialCategory={CATEGORY} />
    </>
  );
}
