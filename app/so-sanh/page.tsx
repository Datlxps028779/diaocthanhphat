import { CompareClient } from '../_clients/pageClients';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/so-sanh';
const fallback = {
  title: 'So sánh bất động sản',
  description: 'So sánh nhanh các bất động sản đã chọn: giá, diện tích, giá/m², pháp lý, hướng và tiện ích.',
  path: PATH,
  routeType: 'WebPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'So sánh bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}

export default async function Page() {
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <CompareClient />
    </>
  );
}
