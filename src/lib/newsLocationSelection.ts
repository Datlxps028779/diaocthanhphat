import type { Area, District, Neighborhood, Ward } from './supabase';

export type NewsLocationFields = {
  area_id: string;
  district_id: string;
  ward_id: string;
  neighborhood_id: string;
};

export type NewsLocationTaxonomy = {
  areas: Area[];
  districts: District[];
  wards: Ward[];
  neighborhoods: Neighborhood[];
};

export type ResolvedNewsLocation = {
  area: Area | null;
  district: District | null;
  ward: Ward | null;
  neighborhood: Neighborhood | null;
};

export const EMPTY_NEWS_LOCATION: NewsLocationFields = {
  area_id: '',
  district_id: '',
  ward_id: '',
  neighborhood_id: '',
};

function byId<T extends { id: string }>(items: T[], id: string): T | null {
  return id ? items.find(item => item.id === id) ?? null : null;
}

// Neighborhoods may deliberately stop at province or district level. Resolve their
// known hierarchy without guessing from free-form GEO narrative fields.
export function resolveNewsLocation(
  value: NewsLocationFields,
  taxonomy: NewsLocationTaxonomy,
): ResolvedNewsLocation {
  const selectedNeighborhood = byId(taxonomy.neighborhoods, value.neighborhood_id);
  const selectedWard = byId(taxonomy.wards, value.ward_id || selectedNeighborhood?.ward_id || '');
  const selectedDistrict = byId(
    taxonomy.districts,
    value.district_id || selectedNeighborhood?.district_id || selectedWard?.district_id || '',
  );
  const selectedArea = byId(
    taxonomy.areas,
    value.area_id || selectedNeighborhood?.area_id || selectedDistrict?.area_id || '',
  );

  return {
    area: selectedArea,
    district: selectedDistrict,
    ward: selectedWard,
    neighborhood: selectedNeighborhood,
  };
}

export function selectNewsArea(areaId: string): NewsLocationFields {
  return { area_id: areaId, district_id: '', ward_id: '', neighborhood_id: '' };
}

export function selectNewsDistrict(current: NewsLocationFields, districtId: string): NewsLocationFields {
  return { ...current, district_id: districtId, ward_id: '', neighborhood_id: '' };
}

export function selectNewsWard(current: NewsLocationFields, wardId: string): NewsLocationFields {
  return { ...current, ward_id: wardId, neighborhood_id: '' };
}

export function selectNewsNeighborhood(
  current: NewsLocationFields,
  neighborhoodId: string,
  taxonomy: NewsLocationTaxonomy,
): NewsLocationFields {
  const neighborhood = byId(taxonomy.neighborhoods, neighborhoodId);
  if (!neighborhood) return { ...current, neighborhood_id: '' };
  const resolved = resolveNewsLocation({ ...current, neighborhood_id: neighborhoodId }, taxonomy);
  return {
    area_id: resolved.area?.id ?? current.area_id,
    district_id: resolved.district?.id ?? current.district_id,
    ward_id: resolved.ward?.id ?? current.ward_id,
    neighborhood_id: neighborhoodId,
  };
}

export function locationLabel(location: ResolvedNewsLocation): string | null {
  return location.neighborhood?.name ?? location.ward?.name ?? location.district?.name ?? location.area?.name ?? null;
}

export function filterNewsNeighborhoods(
  current: NewsLocationFields,
  taxonomy: NewsLocationTaxonomy,
): Neighborhood[] {
  return taxonomy.neighborhoods.filter(neighborhood => {
    const resolved = resolveNewsLocation({ ...EMPTY_NEWS_LOCATION, neighborhood_id: neighborhood.id }, taxonomy);
    if (current.area_id && resolved.area?.id !== current.area_id) return false;
    if (current.district_id && resolved.district?.id !== current.district_id) return false;
    if (current.ward_id && resolved.ward?.id !== current.ward_id) return false;
    return true;
  });
}
