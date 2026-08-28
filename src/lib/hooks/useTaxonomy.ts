import { useQuery } from '@tanstack/react-query';
import { getAreas, getPropertyTypes, getDistricts, getWards, getNeighborhoods, getTaxonomyGeo } from '../api';

// Taxonomy (khu vực, loại BĐS, quận/huyện) gần như không đổi và được gọi ở hầu hết
// mọi trang. Cache dài + dedup qua React Query để tránh fetch lặp lại nhiều lần.
// staleTime dài hơn mặc định vì dữ liệu này rất ít thay đổi.
const TAXONOMY_STALE = 30 * 60 * 1000; // 30 phút

export function useTaxonomyGeo(entityIds: string[]) {
  const ids = [...new Set(entityIds.filter(Boolean))];
  return useQuery({
    queryKey: ['taxonomyGeo', ...ids.sort()],
    queryFn: () => getTaxonomyGeo(ids),
    enabled: ids.length > 0,
    staleTime: TAXONOMY_STALE,
  });
}
export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: getAreas,
    staleTime: TAXONOMY_STALE,
  });
}

export function usePropertyTypes() {
  return useQuery({
    queryKey: ['propertyTypes'],
    queryFn: getPropertyTypes,
    staleTime: TAXONOMY_STALE,
  });
}

export function useDistricts(areaId?: string, options?: { fetchAll?: boolean }) {
  const enabled = Boolean(areaId) || options?.fetchAll !== false;
  return useQuery({
    queryKey: ['districts', areaId ?? 'all'],
    queryFn: () => getDistricts(areaId),
    enabled,
    staleTime: TAXONOMY_STALE,
  });
}

export function useWards(districtId?: string, options?: { fetchAll?: boolean }) {
  const enabled = Boolean(districtId) || options?.fetchAll !== false;
  return useQuery({
    queryKey: ['wards', districtId ?? 'all'],
    queryFn: () => getWards(districtId),
    enabled,
    staleTime: TAXONOMY_STALE,
  });
}

export function useNeighborhoods(wardId?: string, options?: { fetchAll?: boolean }) {
  const enabled = Boolean(wardId) || options?.fetchAll !== false;
  return useQuery({
    queryKey: ['neighborhoods', wardId ?? 'all'],
    queryFn: () => getNeighborhoods(wardId),
    enabled,
    staleTime: TAXONOMY_STALE,
  });
}
