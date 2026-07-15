import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serializeJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { serverGetAreaBySlug, serverGetAreaListings, serverGetAreaStats } from '@/lib/supabase-server';
import {
  areaSummaryFromData,
  buildAreaCollectionJsonLd,
  buildAreaMetadata,
  evaluateAreaSeo,
  getAreaDetails,
  MIN_AREA_LISTINGS_FOR_INDEX,
} from '@/lib/areaSeo';

export const revalidate = 3600;

type Props = { params: { slug: string } };

async function loadArea(slug: string) {
  const area = await serverGetAreaBySlug(slug);
  if (!area) return null;
  const [listings, stats] = await Promise.all([
    serverGetAreaListings(area.id, 12),
    serverGetAreaStats(area.id),
  ]);
  const detail = getAreaDetails(area.slug);
  const summary = areaSummaryFromData(area, detail);
  const evaluation = evaluateAreaSeo({
    area,
    activeListings: Array.from({ length: stats.activeCount }, (_, i) => listings[i] ?? { id: String(i), district: null, property_type_id: null }),
    districts: stats.districts,
    propertyTypes: stats.propertyTypes,
    hasDescription: Boolean(area.description?.trim() || detail?.description?.trim()),
  });
  return { area, listings, stats, detail, summary, evaluation };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadArea(params.slug);
  if (!data) notFound();
  return buildAreaMetadata(data.area, data.summary, data.evaluation);
}

export default async function AreaPage({ params }: Props) {
  const data = await loadArea(params.slug);
  if (!data) notFound();
  const { area, listings, stats, detail, summary, evaluation } = data;
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: 'Khu vực', path: '/khu-vuc' },
    { name: area.name, path: `/khu-vuc/${area.slug}` },
  ]);
  const collection = listings.length > 0 ? buildAreaCollectionJsonLd(area, listings) : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      {collection && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collection) }} />}

      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <nav className="text-xs text-gray-500 mb-4">
            <Link href="/" className="hover:text-red-600">Trang chủ</Link>
            <span className="mx-2">/</span>
            <Link href="/khu-vuc" className="hover:text-red-600">Khu vực</Link>
            <span className="mx-2">/</span>
            <span>{area.name}</span>
          </nav>
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-center">
            <div>
              <p className="text-red-600 font-bold text-sm mb-2">Khu vực bất động sản</p>
              <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">Bất động sản tại {area.name}</h1>
              <p className="text-gray-600 leading-relaxed max-w-3xl">{summary}</p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <Link href={`/mua-ban?area=${area.id}`} className="bg-red-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-red-700">Xem tin mua bán</Link>
                <Link href={`/cho-thue?area=${area.id}`} className="border border-red-500 text-red-600 font-bold px-4 py-2 rounded-xl hover:bg-red-50">Xem tin cho thuê</Link>
                <Link href="/khu-vuc" className="border border-gray-200 text-gray-600 font-bold px-4 py-2 rounded-xl hover:bg-gray-50">Tất cả khu vực</Link>
              </div>
            </div>
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <div className="text-gray-400 text-xs">Tin đang hiển thị</div>
                  <div className="text-2xl font-black text-gray-900">{stats.activeCount}</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <div className="text-gray-400 text-xs">Khu vực con có dữ liệu</div>
                  <div className="text-2xl font-black text-gray-900">{stats.districts.length}</div>
                </div>
              </div>
              {!evaluation.indexable && (
                <p className="mt-4 text-xs text-gray-500">Dữ liệu khu vực đang được cập nhật; danh sách sẽ tự hoàn thiện khi có thêm tin đăng phù hợp.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-10">
        {detail && (
          <div className="grid md:grid-cols-3 gap-4 mb-10">
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h2 className="font-black text-gray-900 mb-3">Hạ tầng nổi bật</h2>
              <ul className="space-y-2 text-sm text-gray-600">{detail.infrastructure.slice(0, 5).map(x => <li key={x}>• {x}</li>)}</ul>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h2 className="font-black text-gray-900 mb-3">Loại hình phù hợp</h2>
              <ul className="space-y-2 text-sm text-gray-600">{detail.investmentTypes.slice(0, 5).map(x => <li key={x}>• {x}</li>)}</ul>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h2 className="font-black text-gray-900 mb-3">Ghi chú thị trường</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{detail.description}</p>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Tin bất động sản tại {area.name}</h2>
            <p className="text-gray-500 text-sm mt-1">Dữ liệu lấy từ các tin đang hoạt động và được cập nhật tự động.</p>
          </div>
          {stats.activeCount >= MIN_AREA_LISTINGS_FOR_INDEX && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full">Đủ dữ liệu hiển thị</span>}
        </div>

        {listings.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {listings.map(p => (
              <Link key={p.id} href={`/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition-all group">
                <div className="h-40 bg-gray-100 overflow-hidden">
                  <img src={p.image_url || 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-sm line-clamp-2 group-hover:text-red-600">{p.title}</h3>
                  <p className="text-red-600 font-black text-sm mt-2">{p.price_label || `${p.price} ${p.price_unit}`}</p>
                  <p className="text-gray-400 text-xs mt-1 truncate">{[p.district, p.city].filter(Boolean).join(', ')}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">Khu vực này đang được cập nhật tin đăng mới.</div>
        )}
      </section>
    </main>
  );
}
