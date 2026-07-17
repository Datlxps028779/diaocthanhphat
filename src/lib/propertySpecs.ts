export type PropertySegment = 'land' | 'house' | 'rental_row' | 'apartment' | 'other';
export type SpecFormTarget = 'user_listing' | 'admin_property';
export type SpecFieldKey =
  | 'area_sqm'
  | 'legal_status'
  | 'direction'
  | 'bedrooms'
  | 'bathrooms'
  | 'frontage'
  | 'road_width'
  | 'floor_count'
  | 'floor_number';

type PropertyTypeLike = { name?: string | null; slug?: string | null };

const SEGMENT_FIELDS: Record<PropertySegment, SpecFieldKey[]> = {
  land: ['area_sqm', 'frontage', 'road_width', 'legal_status', 'direction'],
  house: ['area_sqm', 'bedrooms', 'bathrooms', 'floor_count', 'frontage', 'road_width', 'legal_status', 'direction'],
  rental_row: ['area_sqm', 'floor_count', 'frontage', 'road_width', 'legal_status', 'direction'],
  apartment: ['area_sqm', 'bedrooms', 'bathrooms', 'floor_number', 'legal_status', 'direction'],
  other: ['area_sqm', 'legal_status', 'direction'],
};

const USER_LISTING_FIELDS = new Set<SpecFieldKey>(['area_sqm', 'legal_status', 'direction', 'bedrooms', 'bathrooms']);
const ALL_SPEC_FIELDS = Object.values(SEGMENT_FIELDS).flat().filter((field, index, fields) => fields.indexOf(field) === index);

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

export function classifyPropertySegment(type?: PropertyTypeLike | null): PropertySegment {
  const text = `${normalize(type?.slug)} ${normalize(type?.name)}`;
  if (!text.trim()) return 'other';
  if (/(day[-\s]?tro|nha[-\s]?tro|phong[-\s]?tro)/.test(text)) return 'rental_row';
  if (/(chung[-\s]?cu|can[-\s]?ho|nha[-\s]?o[-\s]?xa[-\s]?hoi)/.test(text)) return 'apartment';
  if (/(dat|khu[-\s]?cong[-\s]?nghiep)/.test(text)) return 'land';
  if (/(nha|biet[-\s]?thu)/.test(text)) return 'house';
  return 'other';
}

export function getCompatibleSpecFields(type: PropertyTypeLike | null | undefined, target: SpecFormTarget): SpecFieldKey[] {
  const fields = SEGMENT_FIELDS[classifyPropertySegment(type)];
  if (target === 'admin_property') return fields;
  return fields.filter(field => USER_LISTING_FIELDS.has(field));
}

function emptyLike(value: unknown): unknown {
  return typeof value === 'number' || value === null ? null : '';
}

export function clearIncompatibleSpecValues<T extends Record<string, unknown>>(
  values: T,
  type: PropertyTypeLike | null | undefined,
  target: SpecFormTarget,
): T {
  const allowed = new Set(getCompatibleSpecFields(type, target));
  const next = { ...values };
  for (const field of ALL_SPEC_FIELDS) {
    if (field in next && !allowed.has(field)) {
      next[field as keyof T] = emptyLike(next[field as keyof T]) as T[keyof T];
    }
  }
  return next;
}
