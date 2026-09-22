import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { SiteChrome } from '@/components/SiteChrome';
import { LocalityHeader, LocalityLandingFooter, LocalityReportBody, LocalitySubnav } from '@/components/area/LocalityPageContent';
import { AreaListingClient } from '../../app/_clients/pageClients';
import { listingTypeToSlug, type ListingType } from './areaPath';
import { LISTINGS_PER_PAGE, parseListingParams } from './router';
import { detectProductCode, renderProductDetail, productMetadataFromRest } from './productDetailPage';
import { buildLocalityMetadata, buildLocalitySchemas, type LocalityPageData } from './localityPageData';
import { loadLocalityPage } from './server/localityPage';
import { buildLocalityGeoAreaAllowlist } from './localityNewsMatch';
import { serverGetLocalityNews } from './supabase-server';
import { loadLocalityListings } from './server/localityListings';

export function loadAreaListing(listingSlug: string, rest: string[] | undefined) {
  return loadLocalityPage(`/${listingSlug}/${(rest ?? []).join('/')}`);
}

export type AreaListingData = LocalityPageData;
export const buildAreaListingMetadata = buildLocalityMetadata;

export function areaListingMetadataFactory(listingType: ListingType) {
  return async ({ params, searchParams }: {
    params: { areaSlug: string; rest?: string[] };
    searchParams?: Record<string, string | string[] | undefined>;
  }): Promise<Metadata> => {
    const rest = [params.areaSlug, ...(params.rest ?? [])];
    const productMeta = await productMetadataFromRest(listingType, rest);
    if (productMeta) return productMeta;
    const data = await loadAreaListing(listingTypeToSlug(listingType), rest);
    if (!data) notFound();
    return buildLocalityMetadata(data, Object.keys(searchParams ?? {}).length > 0);
  };
}

export async function renderAreaListingPage(
  listingType: ListingType,
  params: { areaSlug: string; rest?: string[] },
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const rest = [params.areaSlug, ...(params.rest ?? [])];
  if (detectProductCode(rest) != null) return renderProductDetail(listingType, rest);
  const path = `/${listingTypeToSlug(listingType)}/${rest.join('/')}`;
  const data = await loadLocalityPage(path);
  if (!data) notFound();
  if (data.context.path !== path) redirect(data.context.path);
  const dynamicQuery = Object.keys(searchParams ?? {}).length > 0;
  const { context } = data;
  const news = await serverGetLocalityNews({
    areaId: data.area.id,
    geoAreaAllowlist: buildLocalityGeoAreaAllowlist(data.area.name),
  });
  const newsPath = news.available && news.indexable ? `/khu-vuc/${data.area.slug}/tin-tuc` : null;
  const localitySubnav = <LocalitySubnav data={data} newsPath={newsPath} activePath={context.path} />;
  if (context.mode === 'report') return <>
    <JsonLdScripts schemas={dynamicQuery ? [] : buildLocalitySchemas(data)} />
    <SiteChrome currentPage={{ name: 'listings', listingType }} localityActions localitySubnav={localitySubnav}>
      <main id="main-content" className="bg-white"><LocalityHeader data={data} newsPath={newsPath} /><LocalityReportBody data={data} /></main>
    </SiteChrome>
  </>;
  const scope = {
    listingType, areaId: context.areaId,
    districtId: context.districtId ?? undefined,
    wardId: context.wardId ?? undefined,
    typeIds: context.typePathSegment ? context.propertyTypeIds : undefined,
    salePriceBand: context.priceBand ?? undefined,
  };
  const listings = scope.typeIds?.length === 0 ? [] : await loadLocalityListings(scope, LISTINGS_PER_PAGE);
  const { areaId: _area, district: queryDistrict, ward: queryWard, typeId: queryTypeId, typeSlug: queryTypeSlug, ...extra } = parseListingParams(searchParams);
  const typePathSlug = context.typePathSegment ?? undefined;
  const baseFilters = { ...scope, district: context.districtName ?? queryDistrict, ward: context.wardName ?? queryWard, typePathSlug };
  const queryFilters = {
    ...extra,
    ...(!scope.typeIds ? { typeId: queryTypeId, typeSlug: queryTypeSlug } : {}),
    ...(scope.salePriceBand ? { minPrice: undefined, maxPrice: undefined } : {}),
  };
  const transactionPathSuffix = context.path
    .replace(/^\/(?:mua-ban|cho-thue)/, '')
    .replace(/\/(?:loai|gia)\/.*$/, '');
  return <>
    <JsonLdScripts schemas={dynamicQuery ? [] : buildLocalitySchemas(data, listings)} />
    <AreaListingClient
      listingType={listingType}
      filters={{ ...queryFilters, ...baseFilters }}
      initialData={dynamicQuery ? undefined : { data: listings, total: data.report.counts.total }}
      initialDataScope={baseFilters}
      localityScope={{ path: context.path, listingType, areaId: context.areaId, districtId: scope.districtId, wardId: scope.wardId, typeIds: scope.typeIds, typePathSlug, priceBand: scope.salePriceBand }}
      localitySubnav={localitySubnav}
      localityTransactionPaths={{ sale: `/mua-ban${transactionPathSuffix}`, rent: `/cho-thue${transactionPathSuffix}` }}
      header={<><LocalityHeader data={data} newsPath={newsPath} />{dynamicQuery && <p className="mx-auto max-w-[1360px] px-4 pt-4 text-xs leading-6 text-gray-500 sm:px-8">Danh sách bên dưới có thêm bộ lọc. FAQ và báo cáo cuối trang mô tả phạm vi địa phương của URL, trước các bộ lọc bổ sung.</p>}</>}
      footer={<LocalityLandingFooter data={data} />}
    />
  </>;
}
