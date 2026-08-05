import Link from 'next/link';
import { SiteChrome } from '@/components/SiteChrome';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';
import { serverGetNeighborhoods, serverGetLocationTaxonomy } from '@/lib/supabase-server';
import { resolveNeighborhoodLocation, formatLocationLabel } from '@/lib/neighborhoodLocation';

const PATH = '/khu-dan-cu';
const fallback = {
  title: 'Khu dân cư bất động sản',
  description: 'Danh sách khu dân cư tại Bình Dương: tổng quan, giá nhà đất tham khảo, tin đăng mua bán và cho thuê đang hoạt động.',
  path: PATH,
  routeType: 'CollectionPage' as const,
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Khu dân cư', path: PATH },
  ],
};

export async function generateMetadata() {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}
export const revalidate = 1800;

export default async function Page() {
  const [{ jsonLd }, neighborhoods, taxonomy] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetNeighborhoods(),
    serverGetLocationTaxonomy(),
  ]);

  // Nhóm theo tỉnh, giữ thứ tự order_index của areas; khu chưa gắn tỉnh dồn xuống cuối.
  const withLocation = neighborhoods.map(n => {
    const loc = resolveNeighborhoodLocation(n, taxonomy);
    return { n, loc, label: formatLocationLabel(loc) };
  });
  const groups = taxonomy.areas
    .map(area => ({ area, rows: withLocation.filter(x => x.loc.area?.id === area.id) }))
    .filter(g => g.rows.length > 0);
  const ungrouped = withLocation.filter(x => !x.loc.area);
  const sections = [...groups, ...(ungrouped.length ? [{ area: null, rows: ungrouped }] : [])];

  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <SiteChrome currentPage={{ name: 'regions' }}>
        <main className="bg-gray-50">
          <section className="bg-gray-950 text-white">
            <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
              <nav className="mb-4 text-xs text-white/70">
                <Link href="/" className="hover:text-white">Trang chủ</Link>
                <span className="mx-2">/</span>
                <span className="text-white">Khu dân cư</span>
              </nav>
              <h1 className="text-3xl font-black md:text-5xl">Khu dân cư bất động sản</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/85 md:text-base">{fallback.description}</p>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-8 md:py-10">
            {sections.length > 0 ? (
              <div className="space-y-10">
                {sections.map(({ area, rows }) => (
                  <div key={area?.id ?? 'khac'}>
                    <div className="mb-4 flex items-center gap-3">
                      <span className="h-6 w-1 rounded-full bg-red-600" />
                      <h2 className="text-xl font-black text-gray-900 md:text-2xl">
                        {area ? area.name : 'Khu vực khác'}
                      </h2>
                      <span className="text-xs font-semibold text-gray-400">{rows.length} khu dân cư</span>
                      {area && (
                        <Link href={`/khu-vuc/${area.slug}`} className="ml-auto text-xs font-bold text-red-600 hover:underline">
                          Xem khu vực {area.name}
                        </Link>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {rows.map(({ n, label }) => (
                        <Link key={n.id} href={`/khu-dan-cu/${n.slug}`}
                          className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
                          {n.image_url && (
                            <div className="relative h-40 overflow-hidden bg-gray-100">
                              <img src={n.image_url} alt={n.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            </div>
                          )}
                          <div className="space-y-2 p-5">
                            <h3 className="text-lg font-black text-gray-900 transition-colors group-hover:text-red-600">Khu dân cư {n.name}</h3>
                            {label && <p className="text-xs font-semibold text-gray-400">{label}</p>}
                            {n.description && <p className="line-clamp-2 text-sm leading-6 text-gray-500">{n.description}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                <h2 className="text-lg font-black text-gray-900">Đang cập nhật khu dân cư.</h2>
                <p className="mt-2 text-sm text-gray-500">Vui lòng quay lại sau hoặc xem theo khu vực.</p>
                <Link href="/khu-vuc" className="mt-5 inline-flex rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Xem khu vực</Link>
              </div>
            )}
          </section>
        </main>
      </SiteChrome>
    </>
  );
}
