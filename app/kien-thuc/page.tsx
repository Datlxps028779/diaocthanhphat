import type { Metadata } from 'next';
import { NewsListClient } from '../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';
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
  const [articles, { jsonLd }] = await Promise.all([
    serverGetNews(24, CATEGORY),
    loadRouteSeo(PATH, fallback),
  ]);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <NewsListClient initialArticles={articles} initialCategory={CATEGORY} />
    </>
  );
}
