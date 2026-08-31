import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { AreaListingClient } from '../../app/_clients/pageClients';
import { PriceStatsBlock } from '@/components/PriceStatsBlock';
import { WardPriceBreakdown } from '@/components/WardPriceBreakdown';
import { buildBreadcrumbJsonLd } from '@/lib/seo';
import { buildPriceAnswer } from '@/lib/priceStatsFormat';
import {
  serverGetAreaBySlug,
  serverGetAreaListings,
  serverGetAreaStats,
  serverGetPriceStats,
  serverGetAreaWardPriceStats,
  serverGetDistrictsByArea,
} from '@/lib/supabase-server';
import {
  areaSummaryFromData,
  buildAreaCollectionJsonLd,
  buildAreaMetadata,
  evaluateAreaSeo,
  getAreaDetails,
} from '@/lib/areaSeo';
import { parseAreaListingPath, resolveAreaPath, buildAreaListingPath, listingTypeToSlug, type ListingType } from '@/lib/areaPath';
import { parseListingParams } from '@/lib/router';
import { hasDynamicListingQuery } from '@/lib/routeSeo';
import { detectProductCode, renderProductDetail, productMetadataFromRest } from '@/lib/productDetailPage';

// Nhãn giao dịch hiển thị + trong tiêu đề SEO. Khác nhau theo path /mua-ban vs /cho-thue.
const LISTING_LABEL: Record<ListingType, string> = { mua_ban: 'mua bán', cho_thue: 'cho thuê' };

// Resolve path khu vực (/cho-thue/binh-duong/di-an) → toàn bộ dữ liệu render. Null khi
// listingType/area/district không hợp lệ → route gọi notFound(). Tái dùng server helpers
// của trang /khu-vuc/[slug]; thêm districts để map districtSlug → id + name thật.
export async function loadAreaListing(listingSlug: string, rest: string[] | undefined) {
  const parts = parseAreaListingPath(listingSlug, rest);
  if (!parts) return null;
  const area = await serverGetAreaBySlug(parts.areaSlug);
  if (!area) return null;
  const districts = await serverGetDistrictsByArea(area.id);
  const resolved = resolveAreaPath(parts.areaSlug, parts.districtSlug, { areas: [area], districts });
  if (!resolved) return null;

  const scope = { listingType: parts.listingType, district: resolved.district?.name };
  const [listings, stats, priceStats, wardPriceStats] = await Promise.all([
    serverGetAreaListings(area.id, 12, scope),
    serverGetAreaStats(area.id, scope),
    serverGetPriceStats('area', area.slug),
    serverGetAreaWardPriceStats(area.id),
  ]);
  const detail = getAreaDetails(area.slug);
  const summary = areaSummaryFromData(area, detail);
  // Quality-gate index dùng chung engine với /khu-vuc; đủ tin + có mô tả riêng mới cho index.
  const evaluation = evaluateAreaSeo({
    area,
    activeListings: Array.from({ length: stats.activeCount }, (_, i) => listings[i] ?? { id: String(i), district: null, property_type_id: null }),
    districts: stats.districts,
    propertyTypes: stats.propertyTypes,
    hasDescription: Boolean(area.description?.trim() || detail?.description?.trim()),
  });

  const path = buildAreaListingPath({ listingType: parts.listingType, areaSlug: parts.areaSlug, districtSlug: parts.districtSlug });
  return { parts, area, district: resolved.district, listings, stats, detail, summary, evaluation, priceStats, wardPriceStats, path };
}

export type AreaListingData = NonNullable<Awaited<ReturnType<typeof loadAreaListing>>>;

// Metadata: tái dùng buildAreaMetadata (title/og/robots) rồi override canonical về path
// mới này (KHÔNG để trỏ /khu-vuc) + chèn nhãn giao dịch vào tiêu đề để mỗi path khác nhau.
export function buildAreaListingMetadata(data: AreaListingData): Metadata {
  const { area, district, summary, evaluation, parts, path } = data;
  const scopeName = district ? `${district.name}, ${area.name}` : area.name;
  const label = LISTING_LABEL[parts.listingType];
  const base = buildAreaMetadata(area, summary, evaluation);
  const title = area.meta_title
    ? `${area.meta_title} — ${label}`
    : `Bất động sản ${label} ${scopeName}`;
  // Cấp quận/huyện chưa có dữ liệu giá/mô tả riêng (chỉ tự-sinh từ số liệu tỉnh) →
  // noindex để không tạo trang mỏng/trùng dưới mỗi tỉnh. Cấp tỉnh giữ quality-gate của
  // evaluateAreaSeo. Sẽ mở index cấp quận khi có nội dung thật (đợt sau).
  const robots = district ? { index: false, follow: true } : base.robots;
  return {
    ...base,
    title,
    robots,
    alternates: { canonical: path },
    openGraph: { ...base.openGraph, title, url: path },
  };
}

async function metadataFromParams(listingSlug: string, rest: string[] | undefined): Promise<Metadata> {
  const data = await loadAreaListing(listingSlug, rest);
  if (!data) notFound();
  return buildAreaListingMetadata(data);
}

export function areaListingMetadataFactory(listingType: ListingType) {
  const listingSlug = listingTypeToSlug(listingType);
  return async ({
    params,
    searchParams,
  }: {
    params: { areaSlug: string; rest?: string[] };
    searchParams?: Record<string, string | string[] | undefined>;
  }) => {
    const rest = [params.areaSlug, ...(params.rest ?? [])];
    // Segment cuối khớp -pr{số} → metadata chi tiết sản phẩm (redirect/notFound xử lý
    // TẠI ĐÂY vì chạy trước khi stream shell — xem ghi chú productMetadataFromRest).
    const productMeta = await productMetadataFromRest(listingType, rest);
    if (productMeta) return productMeta;
    const metadata = await metadataFromParams(listingSlug, rest);
    return hasDynamicListingQuery(searchParams)
      ? { ...metadata, robots: { index: false, follow: true } }
      : metadata;
  };
}

// Khối nội dung tĩnh riêng cho từng khu vực (chống thin/duplicate): tổng quan + hạ tầng +
// loại hình + giá tổng hợp + FAQ. Hiển thị TRÊN danh sách tin qua AreaListingClient.
function AreaStaticHeader({ data }: { data: AreaListingData }) {
  const { area, district, stats, detail, summary, evaluation, priceStats, wardPriceStats, parts } = data;
  const scopeName = district ? `${district.name}, ${area.name}` : area.name;
  const label = LISTING_LABEL[parts.listingType];
  const routePriceStats = priceStats.filter(stat => stat.listing_type === parts.listingType);
  const routeWardPriceStats = wardPriceStats.map(ward => ({
    ...ward,
    stats: ward.stats.filter(stat => stat.listing_type === parts.listingType),
  }));
  const priceAnswer = district ? null : buildPriceAnswer(area.name, routePriceStats, parts.listingType);

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6">
      <nav className="mb-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-red-600">Trang chủ</Link>
        <span className="mx-2">/</span>
        <Link href={`/${listingTypeToSlug(parts.listingType)}`} className="hover:text-red-600">Bất động sản {label}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{scopeName}</span>
      </nav>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-red-600">Bất động sản {label}</p>
        <h1 className="mt-1 text-2xl font-black text-gray-900 md:text-3xl">Bất động sản {label} {scopeName}</h1>
        {priceAnswer && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold leading-7 text-red-800">{priceAnswer}</p>}
        <p className="mt-3 text-sm leading-7 text-gray-600">{detail?.description || summary}</p>
        {!evaluation.indexable && (
          <span className="mt-3 inline-flex w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Dữ liệu đang cập nhật</span>
        )}
        {detail?.highlights?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.highlights.map(item => <span key={item} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">{item}</span>)}
          </div>
        ) : null}
      </div>

      {!district && <div className="mt-5"><PriceStatsBlock entityName={scopeName} priceStats={routePriceStats} showAnswer={false} /></div>}
      {!district && <div className="mt-5"><WardPriceBreakdown areaName={area.name} wards={routeWardPriceStats} /></div>}

      {(detail?.infrastructure?.length || detail?.investmentTypes?.length) ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {detail?.infrastructure?.length ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-gray-900">Hạ tầng nổi bật</h2>
              <ul className="mt-4 space-y-3 text-sm text-gray-600">
                {detail.infrastructure.slice(0, 6).map(item => (
                  <li key={item} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {detail?.investmentTypes?.length ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-gray-900">Loại hình phù hợp</h2>
              <ul className="mt-4 space-y-3 text-sm text-gray-600">
                {detail.investmentTypes.slice(0, 6).map(item => (
                  <li key={item} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-6 text-xs text-gray-400">{district ? 'Danh sách tin được lọc theo quận/huyện và cập nhật tự động bên dưới.' : `${stats.activeCount} tin đang hoạt động tại ${scopeName}. Danh sách cập nhật tự động bên dưới.`}</p>
    </section>
  );
}

// Renderer dùng chung cho 2 route /mua-ban và /cho-thue. Route page chỉ truyền listingType.
export async function renderAreaListingPage(
  listingType: ListingType,
  params: { areaSlug: string; rest?: string[] },
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const listingSlug = listingTypeToSlug(listingType);
  const rest = [params.areaSlug, ...(params.rest ?? [])];
  // Segment cuối khớp -pr{số} → nhánh chi tiết sản phẩm (cùng cây route khu vực).
  if (detectProductCode(rest) != null) {
    return renderProductDetail(listingType, rest);
  }
  const data = await loadAreaListing(listingSlug, rest);
  if (!data) notFound();
  const { area, district, listings, stats, parts, path } = data;
  const scopeName = district ? `${district.name}, ${area.name}` : area.name;

  // Filter phụ (giá/loại/phòng/hướng…) từ query → seed lại khi F5/share link. area &
  // district lấy từ PATH nên loại khỏi query (path thắng), tránh ghi đè khu vực.
  const { areaId: _qArea, district: _qDistrict, ...extraFilters } = parseListingParams(searchParams);
  const dynamicQuery = hasDynamicListingQuery(searchParams);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: `Bất động sản ${LISTING_LABEL[parts.listingType]}`, path: `/${listingSlug}` },
    { name: scopeName, path },
  ]);
  const collection = listings.length > 0
    ? buildAreaCollectionJsonLd(area, listings, {
        path,
        name: `Bất động sản ${LISTING_LABEL[parts.listingType]} ${scopeName}`,
      })
    : null;

  return (
    <>
      <JsonLdScripts schemas={dynamicQuery ? [breadcrumb] : [breadcrumb, collection]} />
      <AreaListingClient
        listingType={parts.listingType}
        filters={{ ...extraFilters, areaId: area.id, district: district?.name }}
        initialData={{ data: listings, total: stats.activeCount }}
        initialDataScope={{ listingType: parts.listingType, areaId: area.id, district: district?.name }}
        header={<AreaStaticHeader data={data} />}
      />
    </>
  );
}
