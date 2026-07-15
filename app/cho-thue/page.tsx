import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Cho thuê bất động sản',
  description: 'Danh sách nhà đất, bất động sản cho thuê tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  path: '/cho-thue',
});
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const props = await serverGetListings('cho_thue');
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Cho thuê bất động sản', path: '/cho-thue' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <ListingsClient listingType="cho_thue" filters={parseListingParams(searchParams)} initialData={{ data: props, total: props.length }} />
    </>
  );
}
