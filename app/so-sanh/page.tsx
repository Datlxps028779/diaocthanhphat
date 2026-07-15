import type { Metadata } from 'next';
import { CompareClient } from '../_clients/pageClients';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'So sánh bất động sản',
  description: 'So sánh nhanh các bất động sản đã chọn: giá, diện tích, giá/m², pháp lý, hướng và tiện ích.',
  path: '/so-sanh',
});

export default function Page() {
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'So sánh bất động sản', path: '/so-sanh' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <CompareClient />
    </>
  );
}
