import { useQuery } from '@tanstack/react-query';
import { getHomeLocationStats } from '../api/homeLocationStats';

export function useHomeLocationStats(enabled: boolean) {
  return useQuery({
    queryKey: ['public', 'home-location-stats'],
    queryFn: ({ signal }) => getHomeLocationStats(signal),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
