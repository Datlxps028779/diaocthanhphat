import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo, hasDynamicListingQuery, noindexDynamicListingMetadata } from '@/lib/routeSeo';

const PATH = '/mua-ban';
const fallback = {
  title: 'Mua bán bất động sản',
  description: 'Danh sách nhà đất, bất động sản mua bán tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Mua bán bất động sản', path: PATH },
  ],
};

export async function generateMetadata({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return noindexDynamicListingMetadata(metadata, hasDynamicListingQuery(searchParams));
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  // SSR: crawler + AI đọc được danh sách ngay trong HTML gốc (không chờ JS).
  const dynamicQuery = hasDynamicListingQuery(searchParams);
  const [{ jsonLd }, props] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetListings('mua_ban'),
  ]);
  return (
    <>
      <JsonLdScripts schemas={dynamicQuery ? [] : jsonLd} />
      <ListingsClient listingType="mua_ban" filters={parseListingParams(searchParams)} initialData={props} />
    </>
  );
}
