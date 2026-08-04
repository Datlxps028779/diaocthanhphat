import { HomeClient } from './HomeClient';
import { buildFaqJsonLd } from '@/lib/faq';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/';
const fallback = {
  title: 'BĐS Bình Dương – Mua bán, cho thuê bất động sản uy tín',
  description: 'Cổng thông tin mua bán, cho thuê bất động sản Bình Dương và khu vực lân cận với tin thật, pháp lý minh bạch, tư vấn tận tâm.',
  path: PATH,
  // Schema WebSite (kèm SearchAction) đã phát ở app/layout.tsx với @id #website.
  // Để 'WebSite' ở đây nữa sẽ sinh 2 block trùng trên trang chủ, nên dùng WebPage.
  routeType: 'WebPage' as const,
};

// Home revalidate mỗi 30 phút (nội dung động: featured/hot/recent + CMS blocks).
export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function HomePage() {
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  const schemas = [...jsonLd, buildFaqJsonLd()];
  return (
    <>
      <JsonLdScripts schemas={schemas} />
      <HomeClient />
    </>
  );
}
