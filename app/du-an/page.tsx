import type { Metadata } from 'next';
import { ProjectsClient } from '../_clients/pageClients';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Dự án bất động sản',
  description: 'Các dự án bất động sản, khu đô thị, khu dân cư tại Bình Dương và khu vực lân cận.',
  path: '/du-an',
});
export const revalidate = 1800;

export default function Page() {
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Dự án bất động sản', path: '/du-an' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <ProjectsClient />
    </>
  );
}
