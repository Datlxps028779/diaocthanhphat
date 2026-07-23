import Link from 'next/link';
import { RegionsClient } from '../_clients/pageClients';
import { serverGetAreas } from '@/lib/supabase-server';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';

const PATH = '/khu-vuc';
const fallback = {
  title: 'Khu vực bất động sản',
  description: 'Bất động sản theo khu vực tại Bình Dương và các tỉnh lân cận. Thông tin quy hoạch, hạ tầng, giá đất.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Khu vực bất động sản', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const [{ jsonLd }, areas] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetAreas(),
  ]);
  const areaParam = Array.isArray(searchParams?.area) ? searchParams?.area[0] : searchParams?.area;
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <RegionsClient initialAreaId={areaParam} />
      {areas.length > 0 && (
        <section className="bg-white border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <h2 className="font-black text-gray-900 text-xl mb-3">Trang khu vực chuyên sâu</h2>
            <div className="flex flex-wrap gap-2">
              {areas.map(area => (
                <Link key={area.id} href={`/khu-vuc/${area.slug}`} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-red-300 hover:text-red-600">
                  Bất động sản {area.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
