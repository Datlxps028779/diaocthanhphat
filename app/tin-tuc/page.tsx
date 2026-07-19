import { NewsListClient } from '../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

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

export default async function Page() {
  const [{ jsonLd }, articles] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetNews(),
  ]);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <NewsListClient initialArticles={articles} />
    </>
  );
}
