import { RegionsClient } from '../_clients/pageClients';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/khu-vuc';
const fallback = {
  title: 'Khu vực bất động sản',
  description: 'Bất động sản theo khu vực tại Bình Dương và các tỉnh lân cận. Thông tin quy hoạch, hạ tầng, giá đất.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Khu vực bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  const areaParam = Array.isArray(searchParams?.area) ? searchParams?.area[0] : searchParams?.area;
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <RegionsClient initialAreaId={areaParam} />
    </>
  );
}
