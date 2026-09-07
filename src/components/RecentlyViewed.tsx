'use client';
import { useEffect, useState } from 'react';
import { getPublicPropertiesByIds } from '../lib/api/properties';
import { getRecentlyViewed, pruneRecentlyViewed, toRecentProperty, type RecentProperty } from '../lib/recentlyViewed';
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
    let alive = true;
    const snapshots = getRecentlyViewed(excludeId);
    const ids = snapshots.map(item => item.id);
    setItems([]);
    if (ids.length === 0) return () => { alive = false; };

    getPublicPropertiesByIds(ids)
      .then(properties => {
        if (!alive) return;
        const visibleIds = properties.map(property => property.id);
        pruneRecentlyViewed(visibleIds, excludeId);
        setItems(properties.map(toRecentProperty));
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => { alive = false; };
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
