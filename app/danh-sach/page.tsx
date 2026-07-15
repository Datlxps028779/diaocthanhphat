import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Danh sách bất động sản',
  description: 'Toàn bộ nhà đất, bất động sản mua bán và cho thuê tại Bình Dương và khu vực lân cận.',
  path: '/danh-sach',
});
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const props = await serverGetListings();
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Danh sách bất động sản', path: '/danh-sach' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <ListingsClient filters={parseListingParams(searchParams)} initialData={{ data: props, total: props.length }} />
    </>
  );
}
