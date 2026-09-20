import type { Metadata } from 'next';
import { PRICE_BANDS, resolveLocalityPageContext, type LocalityTaxonomy } from './localityPageContext';
import { buildLocalityFaq, evaluateLocalitySeo, getLocalityReport, type LocalityReportRow } from './localityReport';
import { districtDisplaySlug } from './areaPath';
import { absoluteUrl } from './siteUrl';
import { buildProductPath } from './productPath';
import { buildBreadcrumbJsonLd } from './seo';
import { buildFaqJsonLd } from './propertyFaq';
import type { Property } from './supabase';

export type LocalityPageSnapshot = Omit<LocalityTaxonomy, 'areas'> & {
  computedAt: string;
  rows: readonly LocalityReportRow[];
  areas: ReadonlyArray<LocalityTaxonomy['areas'][number] & {
    description?: string | null;
    admin_note?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    focus_keywords?: string | null;
    image_url?: string | null;
  }>;
};

export type LocalityPageLink = { label: string; href: string; count: number };
export type LocalityDistribution = { title: string; rows: { label: string; count: number; href?: string }[] };

export function buildLocalityPageData(path: string, snapshot: LocalityPageSnapshot) {
  const context = resolveLocalityPageContext(path, snapshot);
  if (!context) return null;
  const area = snapshot.areas.find(item => item.id === context.areaId)!;
  const report = getLocalityReport(snapshot.rows, context, snapshot.computedAt);
  if ((context.typeNamespaced || context.priceBand) && report.counts.total === 0) return null;
  const options = { hasDescription: Boolean(area.description?.trim()) };
  const evaluation = evaluateLocalitySeo(context, report, options);
  const reportContext = resolveLocalityPageContext(context.reportPath, snapshot)!;
  const reportEvaluation = evaluateLocalitySeo(reportContext, report, options);
  const base = `/${context.listingType === 'cho_thue' ? 'cho-thue' : 'mua-ban'}/${area.slug}`;
  const landingPath = context.mode === 'report' ? context.path.replace(/\/thong-tin$/, '') : context.path;
  const links: { districts: LocalityPageLink[]; wards: LocalityPageLink[]; types: LocalityPageLink[]; prices: LocalityPageLink[] } = { districts: [], wards: [], types: [], prices: [] };
  const add = (list: LocalityPageLink[], href: string, label: string, count: number, includeEmpty = false) => {
    const candidate = resolveLocalityPageContext(href, snapshot);
    if (!candidate) return;
    if (count > 0 || includeEmpty) list.push({ label, href: candidate.path, count });
  };
  const hasFacet = Boolean(context.typePathSegment || context.priceBand);
  if (!hasFacet && !context.wardId) {
    if (context.districtId) {
      const district = snapshot.districts.find(item => item.id === context.districtId);
      if (!district) return null;
      for (const ward of snapshot.wards.filter(item => item.district_id === context.districtId)) {
        add(links.wards, `${base}/${context.districtSlug}/phuong-xa/${districtDisplaySlug(district.slug, ward.slug)}`, ward.name, report.distributions.wards[ward.id] ?? 0, true);
      }
    } else {
      for (const district of snapshot.districts.filter(item => item.area_id === area.id)) {
        add(links.districts, `${base}/${districtDisplaySlug(area.slug, district.slug)}`, district.name, report.distributions.districts[district.id] ?? 0, true);
      }
      for (const type of snapshot.propertyTypes) add(links.types, `${base}/loai/${type.slug}`, type.name, report.distributions.propertyTypes[type.id] ?? 0);
      if (context.listingType !== 'cho_thue') {
        for (const band of PRICE_BANDS) add(links.prices, `/mua-ban/${area.slug}/gia/${band.id}`, band.label, report.distributions.priceBands[band.id] ?? 0);
      }
    }
  }
  const labeled = (bucket: Record<string, number>, names: readonly { id: string; name: string }[], missing: string, target?: (id: string) => string | undefined) =>
    Object.entries(bucket).map(([id, count]) => ({ label: names.find(item => item.id === id)?.name ?? missing, count, href: target?.(id) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
  const queryTarget = (fields: Record<string, string>) => {
    const params = new URLSearchParams(context.listingType ? {} : { area: area.id });
    for (const [key, value] of Object.entries(fields)) params.set(key, value);
    return `${context.listingType ? landingPath : '/danh-sach'}?${params}`;
  };
  const districtTarget = (id: string) => {
    const district = snapshot.districts.find(item => item.id === id);
    if (!district) return undefined;
    if (!context.listingType || hasFacet || context.wardId) return queryTarget({ district: district.name });
    return `${base}/${districtDisplaySlug(area.slug, district.slug)}`;
  };
  const wardTarget = (id: string) => {
    const ward = snapshot.wards.find(item => item.id === id);
    if (!ward) return undefined;
    const district = snapshot.districts.find(item => item.id === ward.district_id);
    if (!district) return undefined;
    if (!context.listingType || hasFacet) return queryTarget({ district: district.name, ward: ward.name });
    return `${base}/${districtDisplaySlug(area.slug, district.slug)}/phuong-xa/${districtDisplaySlug(district.slug, ward.slug)}`;
  };
  const typeTarget = (id: string) => {
    const type = snapshot.propertyTypes.find(item => item.id === id);
    if (!type) return undefined;
    if (context.typePathSegment) return context.districtId
      ? `${base}/${context.districtSlug}/${type.slug}`
      : `${base}/loai/${type.slug}`;
    return queryTarget({ type: id });
  };
  const wardLabels = snapshot.wards.map(ward => ({ id: ward.id, name: `${ward.name}, ${snapshot.districts.find(district => district.id === ward.district_id)?.name ?? 'chưa xác định huyện'}` }));
  const distributions: LocalityDistribution[] = [
    { title: 'Phân bố theo quận / huyện', rows: labeled(report.distributions.districts, snapshot.districts, 'Chưa xác định quận / huyện', districtTarget) },
    { title: 'Phân bố theo phường / xã', rows: labeled(report.distributions.wards, wardLabels, 'Chưa xác định phường / xã', wardTarget) },
    { title: 'Cơ cấu loại hình', rows: labeled(report.distributions.propertyTypes, snapshot.propertyTypes, 'Chưa xác định loại hình', typeTarget) },
    { title: 'Khoảng giá chào bán', rows: PRICE_BANDS.map(band => ({ label: band.label, count: report.distributions.priceBands[band.id] ?? 0, href: !context.districtId && !hasFacet ? `/mua-ban/${area.slug}/gia/${band.id}` : undefined })).filter(item => item.count > 0) },
  ].filter(item => item.rows.length > 0);
  const priceRows = (['sale', 'rent'] as const).filter(kind => report.counts[kind] > 0).map(kind => {
    const stats = report.price[kind];
    return { label: kind === 'sale' ? 'Mua bán' : 'Cho thuê', monthly: kind === 'rent', inventory: report.counts[kind], samples: stats.count, mean: stats.meanVnd, median: stats.medianVnd, perSqm: stats.perSqmVnd, sqmSamples: stats.perSqmSampleCount };
  });
  const place = [context.wardName, context.districtName, context.areaName].filter(Boolean).join(', ');
  const summary = `${report.counts.total} tin công khai trong phạm vi ${context.title.toLocaleLowerCase('vi-VN')}: ${report.counts.sale} tin bán và ${report.counts.rent} tin cho thuê. Dữ liệu chỉ phản ánh tin đăng trên Chọn Nhà Việt, không đại diện toàn thị trường.`;
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Khu vực', path: '/khu-vuc' },
    ...(context.path === `/khu-vuc/${area.slug}` ? [] : [{ name: area.name, path: `/khu-vuc/${area.slug}` }]),
    ...(context.mode === 'report' && landingPath !== `/khu-vuc/${area.slug}` ? [{ name: `Tin đăng tại ${place}`, path: landingPath }] : []),
    { name: context.title, path: context.path },
  ];
  return { context, area, report, evaluation, reportEvaluation, summary, place, landingPath, links, distributions, priceRows, breadcrumbs, faq: buildLocalityFaq(context, report) };
}

export type LocalityPageData = NonNullable<ReturnType<typeof buildLocalityPageData>>;

export function buildLocalityMetadata(data: LocalityPageData, dynamicQuery = false): Metadata {
  const isProvince = data.context.path === `/khu-vuc/${data.area.slug}`;
  const title = isProvince && data.area.meta_title?.trim() ? data.area.meta_title : data.context.title;
  const description = isProvince ? data.area.meta_description?.trim() || data.area.description?.trim() || data.summary : data.summary;
  return {
    title, description,
    ...(isProvince && data.area.focus_keywords ? { keywords: data.area.focus_keywords } : {}),
    robots: dynamicQuery ? { index: false, follow: true } : data.evaluation.robots,
    alternates: { canonical: data.context.path },
    openGraph: { title, description, url: data.context.path, type: 'website', locale: 'vi_VN', ...(data.area.image_url ? { images: [{ url: data.area.image_url, alt: title }] } : {}) },
  };
}

export function buildLocalitySchemas(data: LocalityPageData, properties: Property[] = []) {
  const url = absoluteUrl(data.context.path);
  return [
    buildBreadcrumbJsonLd(data.breadcrumbs),
    buildFaqJsonLd(data.faq),
    {
      '@context': 'https://schema.org',
      '@type': data.context.mode === 'report' ? 'WebPage' : 'CollectionPage',
      '@id': `${url}#page`, url, name: data.context.title, description: data.summary,
      inLanguage: 'vi-VN',
      ...(data.context.mode === 'landing' && properties.length ? { mainEntity: {
        '@type': 'ItemList', numberOfItems: properties.length,
        itemListElement: properties.map((property, index) => ({ '@type': 'ListItem', position: index + 1, url: absoluteUrl(buildProductPath(property)), name: property.title })),
      } } : {}),
    },
  ];
}
