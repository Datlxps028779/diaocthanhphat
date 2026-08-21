'use client';
import { useEffect, useState } from 'react';
import { getRecentlyViewed, type RecentProperty } from '../lib/recentlyViewed';
import { PropertyDiscoveryRail } from './discovery/PropertyDiscoveryRail';
import type { DiscoverySurface } from '../lib/discoveryJourney';

// Dải "Đã xem gần đây" — đọc localStorage sau khi mount (tránh lệch SSR/hydration).
// excludeId: bỏ chính BĐS đang xem khỏi danh sách.
export function RecentlyViewed({
  excludeId,
  title = 'Đã xem gần đây',
  subtitle,
  surface = 'property_detail',
  source = 'recently_viewed',
}: {
  excludeId?: string;
  title?: string;
  subtitle?: string;
  surface?: DiscoverySurface;
  source?: string;
}) {
  const [items, setItems] = useState<RecentProperty[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed(excludeId));
  }, [excludeId]);

  return (
    <PropertyDiscoveryRail
      title={title}
      subtitle={subtitle}
      properties={items}
      surface={surface}
      module="recently_viewed"
      source={source}
    />
  );
}
