import type { Property } from './supabase';
import type { PropertyFilters } from './api/properties';

export type LocalityGroupLevel = 'ward' | 'district' | 'area';

export type LocalityGroup = {
  key: string;
  level: LocalityGroupLevel;
  label: string;
  count: number;
  propertyIds: string[];
  representative: Property;
  center: { latitude: number; longitude: number } | null;
  bounds: { north: number; south: number; east: number; west: number } | null;
};

function groupIdentity(property: Property, areaId?: string, preferredLevel?: LocalityGroupLevel): { key: string; level: LocalityGroupLevel; label: string } {
  if (preferredLevel === 'district') {
    if (property.district_id) return { key: `district:${property.district_id}`, level: 'district', label: property.district?.trim() || 'Quận / huyện chưa đặt tên' };
    if (property.area_id || areaId) return { key: `area:${property.area_id ?? areaId}`, level: 'area', label: property.city?.trim() || 'Khu vực' };
  }
  if (preferredLevel === 'area' && (property.area_id || areaId)) {
    return { key: `area:${property.area_id ?? areaId}`, level: 'area', label: property.city?.trim() || 'Khu vực' };
  }
  if (property.ward_id) return { key: `ward:${property.ward_id}`, level: 'ward', label: property.ward?.trim() || 'Phường / xã chưa đặt tên' };
  if (property.district_id) return { key: `district:${property.district_id}`, level: 'district', label: property.district?.trim() || 'Quận / huyện chưa đặt tên' };
  if (property.area_id || areaId) return { key: `area:${property.area_id ?? areaId}`, level: 'area', label: property.city?.trim() || 'Khu vực' };
  return { key: `area:unknown:${property.city?.trim() || 'unknown'}`, level: 'area', label: property.city?.trim() || 'Khu vực chưa xác định' };
}

export function getLocalityGroupKey(property: Property, areaId?: string): string {
  return groupIdentity(property, areaId).key;
}

export function buildLocalityGroups(properties: Property[], areaId?: string, preferredLevel?: LocalityGroupLevel): LocalityGroup[] {
  const groups = new Map<string, LocalityGroup & { latitudes: number[]; longitudes: number[] }>();
  for (const property of properties) {
    const identity = groupIdentity(property, areaId, preferredLevel);
    const existing = groups.get(identity.key);
    const next = existing ?? {
      ...identity,
      count: 0,
      propertyIds: [],
      representative: property,
      center: null,
      bounds: null,
      latitudes: [],
      longitudes: [],
    };
    next.count += 1;
    next.propertyIds.push(property.id);
    if (property.latitude != null && property.longitude != null) {
      next.latitudes.push(property.latitude);
      next.longitudes.push(property.longitude);
    }
    groups.set(identity.key, next);
  }

  return [...groups.values()].map(group => {
    if (!group.latitudes.length) {
      const { latitudes: _latitudes, longitudes: _longitudes, ...withoutCoordinates } = group;
      return withoutCoordinates;
    }
    const north = Math.max(...group.latitudes);
    const south = Math.min(...group.latitudes);
    const east = Math.max(...group.longitudes);
    const west = Math.min(...group.longitudes);
    const { latitudes: _latitudes, longitudes: _longitudes, ...withoutCoordinates } = group;
    return {
      ...withoutCoordinates,
      center: { latitude: Number(((north + south) / 2).toFixed(6)), longitude: Number(((east + west) / 2).toFixed(6)) },
      bounds: { north, south, east, west },
    };
  });
}

export type LocalityScopeGroupOptions = {
  key: string;
  level: LocalityGroupLevel;
  label: string;
  count?: number;
};

export function buildLocalityScopeGroup(properties: Property[], options: LocalityScopeGroupOptions): LocalityGroup | null {
  if (properties.length === 0) return null;
  const located = properties.filter(property => property.latitude != null && property.longitude != null);
  const latitudes = located.map(property => property.latitude!);
  const longitudes = located.map(property => property.longitude!);
  const bounds = located.length ? {
    north: Math.max(...latitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    west: Math.min(...longitudes),
  } : null;
  return {
    key: options.key,
    level: options.level,
    label: options.label,
    count: options.count ?? properties.length,
    propertyIds: properties.map(property => property.id),
    representative: properties[0],
    center: bounds ? {
      latitude: Number(((bounds.north + bounds.south) / 2).toFixed(6)),
      longitude: Number(((bounds.east + bounds.west) / 2).toFixed(6)),
    } : null,
    bounds,
  };
}

export function localityGroupPropertyFilters(filters: PropertyFilters, group: LocalityGroup): PropertyFilters | null {
  // Chỉ group phường/xã biểu diễn một scope taxonomy đầy đủ. Group district/area là
  // bucket fallback cho các tin thiếu ward_id; query cả huyện sẽ lẫn lại các ward đã tách nhóm.
  if (group.level !== 'ward') return null;
  return {
    ...filters,
    districtId: group.representative.district_id ?? undefined,
    wardId: group.representative.ward_id ?? undefined,
    district: undefined,
    ward: undefined,
    page: undefined,
    limit: undefined,
  };
}

export function localityGroupIntersectsBounds(group: LocalityGroup, bounds: { north: number; south: number; east: number; west: number }): boolean {
  if (!group.bounds) return false;
  return group.bounds.north >= bounds.south && group.bounds.south <= bounds.north && group.bounds.east >= bounds.west && group.bounds.west <= bounds.east;
}
