import type { Metadata } from 'next';
import { AboutClient } from '../_clients/pageClients';
import { serializeJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = staticPageMetadata({
  title: 'Về chúng tôi',
  description: 'Giới thiệu về đội ngũ, sứ mệnh và giá trị của chúng tôi trong lĩnh vực bất động sản tại Bình Dương.',
  path: '/ve-chung-toi',
});
export const revalidate = 3600;

export default function Page() {
  const breadcrumb = buildBreadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Về chúng tôi', path: '/ve-chung-toi' }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      <AboutClient />
    </>
  );
}
