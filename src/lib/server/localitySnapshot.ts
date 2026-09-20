import { cache as reactCache } from 'react';
import { unstable_cache } from 'next/cache';
import type { LocalityReportRow } from '../localityReport';
import { readBoundedPublicRows } from './boundedPublicRows';
import { readPublishedPropertyRows, type BoundedReadOptions } from './boundedPublicRead';

export const LOCALITY_SNAPSHOT_CACHE_TAG = 'public-locality-snapshot';
export const LOCALITY_SNAPSHOT_REVALIDATE_SECONDS = 60;
export const LOCALITY_SNAPSHOT_UNAVAILABLE = 'Locality snapshot unavailable';
const PROPERTY_SELECT = 'id,title,area_id,district_id,ward_id,property_type_id,listing_type,price,price_unit,price_per_month,area_sqm';
const AREA_OPTIONAL = ['description', 'admin_note', 'meta_title', 'meta_description', 'focus_keywords', 'image_url'] as const;

export type LocalityArea = { id: string; slug: string; name: string } & Record<typeof AREA_OPTIONAL[number], string | null>;
export type LocalityDistrict = { id: string; area_id: string; slug: string; name: string };
export type LocalityWard = { id: string; district_id: string; slug: string; name: string };
export type LocalityPropertyType = { id: string; slug: string; name: string };
export type LocalitySnapshot = {
  computedAt: string;
  rows: LocalityReportRow[];
  areas: LocalityArea[];
  districts: LocalityDistrict[];
  wards: LocalityWard[];
  propertyTypes: LocalityPropertyType[];
};
export type LocalitySnapshotLoaderOptions = Omit<BoundedReadOptions, 'select' | 'table'>;

async function readTaxonomy<T>(
  options: LocalitySnapshotLoaderOptions,
  table: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Promise<T[]> {
  const fields = ['id', ...required, ...optional];
  const rows = await readBoundedPublicRows({
    fetcher: options.fetcher,
    url: options.url,
    anonKey: options.anonKey,
    pageSize: options.pageSize,
    maxRows: options.maxRows,
    maxPages: options.maxPages,
    timeoutMs: options.timeoutMs,
    table,
    select: fields.join(','),
    validators: {
      stringFields: [...required, ...optional],
      requiredFields: required,
    },
  });
  return rows as T[];
}

export async function loadLocalitySnapshot(options: LocalitySnapshotLoaderOptions = {}): Promise<LocalitySnapshot> {
  try {
    const [areas, districts, wards, propertyTypes] = await Promise.all([
      readTaxonomy<LocalityArea>(options, 'areas', ['slug', 'name'], AREA_OPTIONAL),
      readTaxonomy<LocalityDistrict>(options, 'districts', ['area_id', 'slug', 'name']),
      readTaxonomy<LocalityWard>(options, 'wards', ['district_id', 'slug', 'name']),
      readTaxonomy<LocalityPropertyType>(options, 'property_types', ['slug', 'name']),
    ]);
    const rowsByArea = await Promise.all(areas.map(area => readPublishedPropertyRows({
      ...options,
      table: 'public_properties',
      select: PROPERTY_SELECT,
      filters: { area_id: `eq.${area.id}` },
    })));
    const rows = rowsByArea.flat();
    const areaIds = new Set(areas.map(area => area.id));
    const districtIds = new Set(districts.map(district => district.id));
    if (districts.some(district => !areaIds.has(district.area_id)) || wards.some(ward => !districtIds.has(ward.district_id))) throw new Error(LOCALITY_SNAPSHOT_UNAVAILABLE);
    return { computedAt: new Date().toISOString(), rows, areas, districts, wards, propertyTypes };
  } catch {
    throw new Error(LOCALITY_SNAPSHOT_UNAVAILABLE);
  }
}

const cached = unstable_cache(
  () => loadLocalitySnapshot(),
  ['locality-snapshot'],
  { revalidate: LOCALITY_SNAPSHOT_REVALIDATE_SECONDS, tags: [LOCALITY_SNAPSHOT_CACHE_TAG] },
);

// Chỉ aggregate được gửi đến UI; snapshot nội bộ không chứa thông tin liên hệ/chủ tin.
export const getLocalitySnapshot: () => Promise<LocalitySnapshot> = reactCache(() => cached());
