import { ProjectsClient } from '../_clients/pageClients';
import { parseProjectParams } from '@/lib/router';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/du-an';
const fallback = {
  title: 'Dự án bất động sản',
  description: 'Các dự án bất động sản, khu đô thị, khu dân cư tại Bình Dương và khu vực lân cận.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Dự án bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { jsonLd } = await loadRouteSeo(PATH, fallback);
  const { area, phase } = parseProjectParams(searchParams);
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <ProjectsClient initialArea={area} initialPhase={phase} />
    </>
  );
}
