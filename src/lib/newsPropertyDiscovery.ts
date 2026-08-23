import type { Property } from './supabase';

export type NewsPropertyReason = 'same_neighborhood' | 'same_ward' | 'same_district' | 'same_area';

export type NewsPropertyScope = {
  areaId: string;
  districtId?: string | null;
  wardName?: string | null;
  neighborhoodSlug?: string | null;
};

export type RankedNewsProperty = {
  property: Property;
  reason: NewsPropertyReason;
};

function reasonRank(reason: NewsPropertyReason): number {
  return reason === 'same_neighborhood' ? 0 : reason === 'same_ward' ? 1 : reason === 'same_district' ? 2 : 3;
}

function normalizeLocation(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

function reasonForProperty(property: Property, scope: NewsPropertyScope): NewsPropertyReason | null {
  if (scope.neighborhoodSlug && property.neighborhood_slug === scope.neighborhoodSlug) return 'same_neighborhood';
  if (
    scope.wardName
    && scope.districtId
    && property.district_id === scope.districtId
    && normalizeLocation(property.ward) === normalizeLocation(scope.wardName)
  ) return 'same_ward';
  if (scope.districtId && property.district_id === scope.districtId) return 'same_district';
  if (scope.districtId && property.district_id == null) return null;
  if (property.area_id === scope.areaId) return 'same_area';
  return null;
}

export function rankNewsProperties(
  properties: Property[],
  scope: NewsPropertyScope,
  limit = 4,
): RankedNewsProperty[] {
  if (!scope.areaId || limit <= 0) return [];
  const ranked = new Map<string, RankedNewsProperty>();

  for (const property of properties) {
    if (!property.is_active || property.area_id !== scope.areaId) continue;
    const reason = reasonForProperty(property, scope);
    if (!reason) continue;
    const current = ranked.get(property.id);
    if (!current || reasonRank(reason) < reasonRank(current.reason)) {
      ranked.set(property.id, { property, reason });
    }
  }

  return Array.from(ranked.values())
    .sort((a, b) => {
      const byReason = reasonRank(a.reason) - reasonRank(b.reason);
      if (byReason !== 0) return byReason;
      const byCreated = (b.property.created_at ?? '').localeCompare(a.property.created_at ?? '');
      return byCreated || a.property.id.localeCompare(b.property.id);
    })
    .slice(0, limit);
}

export function newsPropertyReasonLabel(reason: NewsPropertyReason): string {
  switch (reason) {
    case 'same_neighborhood': return 'Cùng khu dân cư';
    case 'same_ward': return 'Cùng phường/xã';
    case 'same_district': return 'Cùng quận/huyện';
    case 'same_area': return 'Cùng tỉnh/thành';
  }
}
