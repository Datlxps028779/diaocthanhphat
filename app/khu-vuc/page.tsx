import type { Metadata } from 'next';
import { RegionsClient } from '../_clients/pageClients';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Khu vực bất động sản',
  description: 'Bất động sản theo khu vực tại Bình Dương và các tỉnh lân cận. Thông tin quy hoạch, hạ tầng, giá đất.',
  path: '/khu-vuc',
});
export const revalidate = 1800;

export default function Page() {
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Khu vực bất động sản', path: '/khu-vuc' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <RegionsClient />
    </>
  );
}
