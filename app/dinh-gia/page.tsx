import type { Metadata } from 'next';
import { ValuationClient } from '../_clients/pageClients';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Định giá bất động sản',
  description: 'Ước tính nhanh khoảng giá nhà đất, bất động sản tại Bình Dương và khu vực lân cận dựa trên dữ liệu giao dịch tương đương.',
  path: '/dinh-gia',
});
export const revalidate = 3600;

export default function Page() {
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Định giá bất động sản', path: '/dinh-gia' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <ValuationClient />
    </>
  );
}
