import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteChrome } from '@/components/SiteChrome';
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
import type { Property } from '@/lib/supabase';

export const revalidate = 3600;

type Props = { params: { slug: string } };

const DEFAULT_AREA_HERO = 'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg?auto=compress&w=1400';

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

function propertyHref(p: Pick<Property, 'id' | 'slug'>): string {
  return `/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`;
}

function priceText(p: Pick<Property, 'price' | 'price_unit' | 'price_label'>): string {
  return p.price_label || `${p.price} ${p.price_unit}`;
}

function PropertyAreaCard({ property }: { property: Property }) {
  const specs = [
    property.area_sqm ? `${property.area_sqm} m²` : null,
    property.bedrooms ? `${property.bedrooms} PN` : null,
    property.legal_status || null,
  ].filter(Boolean);
  const location = [property.district, property.city].filter(Boolean).join(', ');

  return (
    <Link href={propertyHref(property)} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative h-44 overflow-hidden bg-gray-100">
        <img
          src={property.image_url || DEFAULT_AREA_HERO}
          alt={property.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${property.listing_type === 'cho_thue' ? 'bg-blue-600' : 'bg-red-600'}`}>
            {property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán'}
          </span>
          {property.is_verified && <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white">Đã xác minh</span>}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold text-gray-900 transition-colors group-hover:text-red-600">{property.title}</h3>
        <p className="text-base font-black text-red-600">{priceText(property)}</p>
        {location && <p className="truncate text-xs text-gray-500">{location}</p>}
        {specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {specs.map(spec => <span key={spec} className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600">{spec}</span>)}
          </div>
        )}
      </div>
    </Link>
  );
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
  const heroImage = area.image_url || detail?.heroImage || DEFAULT_AREA_HERO;
  const marketChips = detail ? [
    { label: 'Biên giá', value: detail.priceRange },
    { label: 'Tăng trưởng', value: `+${detail.growthPct}%` },
    { label: 'Rủi ro', value: detail.riskLevel },
  ] : [];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }} />
      {collection && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collection) }} />}

      <SiteChrome currentPage={{ name: 'regions' }}>
        <main className="bg-gray-50">
          <section className="relative isolate overflow-hidden bg-gray-900 text-white">
            <img src={heroImage} alt={area.name} className="absolute inset-0 z-0 h-full w-full object-cover" />
            <div className="absolute inset-0 z-10 bg-gradient-to-br from-black/90 via-black/75 to-red-950/75" />
            <div className="relative z-20 mx-auto max-w-7xl px-4 py-12 md:py-16">
              <nav className="mb-6 text-xs text-white/70">
                <Link href="/" className="hover:text-white">Trang chủ</Link>
                <span className="mx-2">/</span>
                <Link href="/khu-vuc" className="hover:text-white">Khu vực</Link>
                <span className="mx-2">/</span>
                <span className="text-white">{area.name}</span>
              </nav>

              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                <div>
                  <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-100 ring-1 ring-white/20">
                    Khu vực bất động sản
                  </p>
                  <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">Bất động sản tại {area.name}</h1>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 md:text-base">{summary}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={`/mua-ban?area=${area.id}`} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/30 hover:bg-red-700">Xem tin mua bán</Link>
                    <Link href={`/cho-thue?area=${area.id}`} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50">Xem tin cho thuê</Link>
                    <Link href="/khu-vuc" className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">Tất cả khu vực</Link>
                  </div>
                </div>

                {marketChips.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                    {marketChips.map(chip => (
                      <div key={chip.label}>
                        <p className="text-[11px] text-white/60">{chip.label}</p>
                        <p className="mt-1 text-sm font-black text-white md:text-base">{chip.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-10">
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-red-600">Tổng quan thị trường</p>
                    <h2 className="mt-1 text-2xl font-black text-gray-900">Vì sao nên theo dõi {area.name}?</h2>
                  </div>
                  {!evaluation.indexable && <span className="w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Dữ liệu đang cập nhật</span>}
                </div>
                <p className="mt-4 text-sm leading-7 text-gray-600">{detail?.description || summary}</p>
                {detail?.highlights?.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {detail.highlights.map(item => <span key={item} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">{item}</span>)}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-black text-gray-900">Hạ tầng nổi bật</h2>
                  <ul className="mt-4 space-y-3 text-sm text-gray-600">
                    {(detail?.infrastructure ?? stats.districts).slice(0, 6).map(item => (
                      <li key={item} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-black text-gray-900">Loại hình phù hợp</h2>
                  <ul className="mt-4 space-y-3 text-sm text-gray-600">
                    {(detail?.investmentTypes ?? ['Nhà phố', 'Đất nền', 'BĐS cho thuê']).slice(0, 6).map(item => (
                      <li key={item} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="text-base font-black text-gray-900">Dữ liệu khu vực</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-red-50 p-4">
                    <p className="text-xs text-red-500">Tin đang hiển thị</p>
                    <p className="mt-1 text-2xl font-black text-red-700">{stats.activeCount}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Khu vực con</p>
                    <p className="mt-1 text-2xl font-black text-gray-900">{stats.districts.length}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Nhóm BĐS</p>
                    <p className="mt-1 text-2xl font-black text-gray-900">{stats.propertyTypes.length}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-600">Trạng thái</p>
                    <p className="mt-1 text-sm font-black text-emerald-700">{stats.activeCount >= MIN_AREA_LISTINGS_FOR_INDEX ? 'Đủ dữ liệu' : 'Đang cập nhật'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Link href={`/mua-ban?area=${area.id}`} className="block rounded-xl bg-red-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-red-700">Xem mua bán</Link>
                  <Link href={`/cho-thue?area=${area.id}`} className="block rounded-xl border border-red-200 px-4 py-2.5 text-center text-sm font-bold text-red-600 hover:bg-red-50">Xem cho thuê</Link>
                </div>
              </div>
            </aside>
          </section>

          <section className="mx-auto max-w-7xl px-4 pb-12">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-red-600">Tin đang hoạt động</p>
                <h2 className="mt-1 text-2xl font-black text-gray-900">Bất động sản tại {area.name}</h2>
                <p className="mt-1 text-sm text-gray-500">Danh sách được cập nhật tự động từ các tin đang hiển thị.</p>
              </div>
              <Link href={`/danh-sach?area=${area.id}`} className="text-sm font-bold text-red-600 hover:underline">Xem tất cả tin phù hợp</Link>
            </div>

            {listings.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map(property => <PropertyAreaCard key={property.id} property={property} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                <h3 className="text-lg font-black text-gray-900">Khu vực này đang được cập nhật tin đăng mới.</h3>
                <p className="mt-2 text-sm text-gray-500">Bạn có thể quay lại trang khu vực để xem các thị trường lân cận.</p>
                <Link href="/khu-vuc" className="mt-5 inline-flex rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Xem tất cả khu vực</Link>
              </div>
            )}
          </section>
        </main>
      </SiteChrome>
    </>
  );
}
