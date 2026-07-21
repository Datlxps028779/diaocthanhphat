import { ValuationClient } from '../_clients/pageClients';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/dinh-gia';
const fallback = {
  title: 'Định giá bất động sản',
  description: 'Ước tính nhanh khoảng giá nhà đất, bất động sản tại Bình Dương và khu vực lân cận dựa trên dữ liệu giao dịch tương đương.',
  path: PATH,
  routeType: 'WebPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Định giá bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 3600;

export default async function Page() {
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <ValuationClient />
    </>
  );
}
