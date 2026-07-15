import type { Metadata } from 'next';
import { InvestClient } from '../_clients/pageClients';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Đầu tư bất động sản',
  description: 'Cơ hội đầu tư bất động sản sinh lời tại Bình Dương và khu vực lân cận. Công cụ tính ROI, tư vấn đầu tư.',
  path: '/dau-tu',
});
export const revalidate = 1800;

export default function Page() {
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Đầu tư bất động sản', path: '/dau-tu' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <InvestClient />
    </>
  );
}
