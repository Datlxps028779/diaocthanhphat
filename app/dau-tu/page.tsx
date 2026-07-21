import { InvestClient } from '../_clients/pageClients';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/dau-tu';
const fallback = {
  title: 'Đầu tư bất động sản',
  description: 'Cơ hội đầu tư bất động sản sinh lời tại Bình Dương và khu vực lân cận. Công cụ tính ROI, tư vấn đầu tư.',
  path: PATH,
  routeType: 'WebPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Đầu tư bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page() {
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <InvestClient />
    </>
  );
}
