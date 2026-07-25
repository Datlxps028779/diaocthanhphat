import Link from 'next/link';
import { SiteChrome } from '@/components/SiteChrome';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';
import { serverGetNeighborhoods } from '@/lib/supabase-server';

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
  const [{ jsonLd }, neighborhoods] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetNeighborhoods(),
  ]);
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
            {neighborhoods.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {neighborhoods.map(n => (
                  <Link key={n.id} href={`/khu-dan-cu/${n.slug}`}
                    className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
                    {n.image_url && (
                      <div className="relative h-40 overflow-hidden bg-gray-100">
                        <img src={n.image_url} alt={n.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </div>
                    )}
                    <div className="space-y-2 p-5">
                      <h2 className="text-lg font-black text-gray-900 transition-colors group-hover:text-red-600">Khu dân cư {n.name}</h2>
                      {n.description && <p className="line-clamp-2 text-sm leading-6 text-gray-500">{n.description}</p>}
                    </div>
                  </Link>
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
