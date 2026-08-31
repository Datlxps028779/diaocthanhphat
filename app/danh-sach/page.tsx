import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo, hasDynamicListingQuery, noindexDynamicListingMetadata } from '@/lib/routeSeo';

const PATH = '/danh-sach';
const fallback = {
  title: 'Danh sách bất động sản',
  description: 'Toàn bộ nhà đất, bất động sản mua bán và cho thuê tại Bình Dương và khu vực lân cận.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Danh sách bất động sản', path: PATH },
  ],
};

export async function generateMetadata({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return noindexDynamicListingMetadata(metadata, hasDynamicListingQuery(searchParams));
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const dynamicQuery = hasDynamicListingQuery(searchParams);
  const [{ jsonLd }, props] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetListings(),
  ]);
  return (
    <>
      <JsonLdScripts schemas={dynamicQuery ? [] : jsonLd} />
      <ListingsClient filters={parseListingParams(searchParams)} initialData={props} />
    </>
  );
}
