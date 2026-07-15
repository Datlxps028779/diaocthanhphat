import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Mua bán bất động sản',
  description: 'Danh sách nhà đất, bất động sản mua bán tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  path: '/mua-ban',
});
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  // SSR: crawler + AI đọc được danh sách ngay trong HTML gốc (không chờ JS).
  const props = await serverGetListings('mua_ban');
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Mua bán bất động sản', path: '/mua-ban' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <ListingsClient listingType="mua_ban" filters={parseListingParams(searchParams)} initialData={{ data: props, total: props.length }} />
    </>
  );
}
