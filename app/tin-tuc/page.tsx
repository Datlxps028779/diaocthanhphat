import { NewsListClient } from '../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';
import { NEWS_CATEGORIES } from '@/lib/newsCategories';

const PATH = '/tin-tuc';
const fallback = {
  title: 'Tin tức thị trường bất động sản',
  description: 'Tin tức, phân tích thị trường bất động sản, quy hoạch, hạ tầng tại Bình Dương và khu vực lân cận.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức thị trường bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: { category?: string | string[] } }) {
  const rawCat = searchParams?.category;
  const requestedCategory = (Array.isArray(rawCat) ? rawCat[0] : rawCat) || undefined;
  const initialCategory = NEWS_CATEGORIES.includes(requestedCategory as typeof NEWS_CATEGORIES[number])
    ? requestedCategory
    : undefined;
  const articles = await serverGetNews(20, initialCategory);
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <NewsListClient initialArticles={articles} initialCategory={initialCategory} />
    </>
  );
}
