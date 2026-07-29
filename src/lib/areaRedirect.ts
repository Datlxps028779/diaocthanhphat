import { buildAreaListingPath, type ListingType } from './areaPath';

export type AreaRedirectListingSlug = 'mua-ban' | 'cho-thue';

export interface AreaRedirectTaxonomy {
  area: { id: string; slug: string } | null;
  districts: { area_id: string; name: string; slug: string }[];
}

const LISTING_TYPE_BY_PATH: Record<AreaRedirectListingSlug, ListingType> = {
  'mua-ban': 'mua_ban',
  'cho-thue': 'cho_thue',
};

export function buildLegacyAreaRedirectPath(
  pathname: string,
  searchParams: URLSearchParams,
  taxonomy: AreaRedirectTaxonomy,
): string | null {
  const listingSlug = pathname.replace(/^\//, '') as AreaRedirectListingSlug;
  const listingType = LISTING_TYPE_BY_PATH[listingSlug];
  if (!listingType || !taxonomy.area) return null;

  const q = new URLSearchParams(searchParams);
  q.delete('area');

  const districtName = searchParams.get('district');
  const district = districtName
    ? taxonomy.districts.find(d => d.area_id === taxonomy.area!.id && d.name === districtName)
    : null;
  if (district) q.delete('district');

  const path = buildAreaListingPath({
    listingType,
    areaSlug: taxonomy.area.slug,
    districtSlug: district?.slug,
  });
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}
