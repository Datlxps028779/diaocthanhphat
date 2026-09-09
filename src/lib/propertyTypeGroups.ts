// Nhóm loại BĐS dùng cho intent và landing SEO. Mapping phải explicit để tránh tự
// gộp sai ngữ nghĩa (ví dụ dãy trọ không tự gộp vào nhà).
export type PropertyTypeSeoGroup = 'nha' | 'dat' | 'day-tro';

const PROPERTY_TYPE_GROUP_BY_SLUG: Readonly<Record<string, PropertyTypeSeoGroup>> = {
  'nha-pho': 'nha',
  'dat-nen': 'dat',
  'dat-mau-dat-sao': 'dat',
  'day-tro': 'day-tro',
};

const PROPERTY_TYPE_SLUGS_BY_GROUP: Readonly<Record<PropertyTypeSeoGroup, readonly string[]>> = {
  nha: ['nha-pho'],
  dat: ['dat-nen', 'dat-mau-dat-sao'],
  'day-tro': ['day-tro'],
};

export function propertyTypeSeoGroupFromSlug(slug: string | null | undefined): PropertyTypeSeoGroup | null {
  if (!slug?.trim()) return null;
  return PROPERTY_TYPE_GROUP_BY_SLUG[slug.trim()] ?? null;
}

export function propertyTypeSlugsForSeoGroup(group: PropertyTypeSeoGroup): readonly string[] {
  return PROPERTY_TYPE_SLUGS_BY_GROUP[group];
}

export function isPropertyTypeSeoGroup(value: string | null | undefined): value is PropertyTypeSeoGroup {
  return Boolean(value && Object.prototype.hasOwnProperty.call(PROPERTY_TYPE_SLUGS_BY_GROUP, value));
}

export function propertyTypeSeoGroupLabel(group: PropertyTypeSeoGroup): string {
  if (group === 'nha') return 'nhà';
  if (group === 'dat') return 'đất';
  return 'dãy trọ';
}
