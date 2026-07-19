import { AboutClient } from '../_clients/pageClients';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/ve-chung-toi';
const fallback = {
  title: 'Về chúng tôi',
  description: 'Giới thiệu về đội ngũ, sứ mệnh và giá trị của chúng tôi trong lĩnh vực bất động sản tại Bình Dương.',
  path: PATH,
  routeType: 'AboutPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Về chúng tôi', path: PATH },
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
      <AboutClient />
    </>
  );
}
