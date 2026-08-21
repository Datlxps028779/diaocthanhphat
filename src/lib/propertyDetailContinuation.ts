import type { Page } from './router';
import type { ListingType } from './supabase';

export type PropertyDetailContinuationTarget = {
  key: 'neighborhood' | 'district' | 'area' | 'related_properties';
  label: string;
  href: string;
};

type DetailPropertySource = {
  listing_type: ListingType;
  area_id: string | null;
  district: string | null;
};

type DetailTaxonomy = {
  areas: { id: string; slug: string }[];
  districts: { area_id: string; name: string; slug: string }[];
  propertyTypes?: { id: string; slug: string }[];
};

type PageToHref = (page: Page, taxonomy?: DetailTaxonomy) => string;

function listingPage(property: DetailPropertySource, district?: string): Extract<Page, { name: 'listings' }> | null {
  if (!property.area_id) return null;
  return {
    name: 'listings',
    listingType: property.listing_type,
    areaId: property.area_id,
    ...(district ? { district } : {}),
  };
}

// Sidebar chỉ đưa khách sang đích có dữ liệu quan hệ thật: khu dân cư đã resolve,
// quận/huyện thuộc đúng tỉnh, danh sách tỉnh, hoặc phần tin tương tự đang hiển thị.
// Mọi đích danh sách giữ nguyên hình thức mua bán/cho thuê của tin đang xem.
export function buildPropertyDetailContinuationTargets(input: {
  property: DetailPropertySource;
  taxonomy: DetailTaxonomy;
  pageToHref: PageToHref;
  neighborhood?: { name: string; slug: string } | null;
  relatedCount: number;
}): PropertyDetailContinuationTarget[] {
  const out: PropertyDetailContinuationTarget[] = [];
  const district = input.property.area_id && input.property.district?.trim()
    ? input.taxonomy.districts.find(item => item.area_id === input.property.area_id && item.name === input.property.district?.trim())
    : undefined;
  const area = input.property.area_id
    ? input.taxonomy.areas.find(item => item.id === input.property.area_id)
    : undefined;

  if (input.neighborhood?.slug && input.neighborhood.name) {
    out.push({
      key: 'neighborhood',
      label: `Xem dữ liệu khu dân cư ${input.neighborhood.name}`,
      href: `/khu-dan-cu/${input.neighborhood.slug}`,
    });
  }

  const districtPage = listingPage(input.property, district?.name);
  if (districtPage && district) {
    out.push({
      key: 'district',
      label: `Xem thêm tin tại ${district.name}`,
      href: input.pageToHref(districtPage, input.taxonomy),
    });
  }

  const areaPage = listingPage(input.property);
  if (areaPage && area) {
    out.push({
      key: 'area',
      label: 'Xem thêm tin trong khu vực',
      href: input.pageToHref(areaPage, input.taxonomy),
    });
  }

  if (input.relatedCount > 0) {
    out.push({
      key: 'related_properties',
      label: 'Xem bất động sản tương tự bên dưới',
      href: '#related-properties',
    });
  }

  const seenHrefs = new Set<string>();
  return out.filter(item => {
    if (seenHrefs.has(item.href)) return false;
    seenHrefs.add(item.href);
    return true;
  });
}
