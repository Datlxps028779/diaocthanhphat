import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/cho-thue';
const fallback = {
  title: 'Cho thuê bất động sản',
  description: 'Danh sách nhà đất, bất động sản cho thuê tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Cho thuê bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const [{ jsonLd }, props] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetListings('cho_thue'),
  ]);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <ListingsClient listingType="cho_thue" filters={parseListingParams(searchParams)} initialData={{ data: props, total: props.length }} />
    </>
  );
}
