import { useQuery } from '@tanstack/react-query';
import { getAreas, getPropertyTypes, getDistricts, getWards } from '../api';

// Taxonomy (khu vực, loại BĐS, quận/huyện) gần như không đổi và được gọi ở hầu hết
// mọi trang. Cache dài + dedup qua React Query để tránh fetch lặp lại nhiều lần.
// staleTime dài hơn mặc định vì dữ liệu này rất ít thay đổi.
const TAXONOMY_STALE = 30 * 60 * 1000; // 30 phút

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

export function useDistricts(areaId?: string) {
  return useQuery({
    queryKey: ['districts', areaId ?? 'all'],
    queryFn: () => getDistricts(areaId),
    staleTime: TAXONOMY_STALE,
  });
}

export function useWards(districtId?: string) {
  return useQuery({
    queryKey: ['wards', districtId ?? 'all'],
    queryFn: () => getWards(districtId),
    staleTime: TAXONOMY_STALE,
  });
}
