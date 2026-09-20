'use client';

import { useEffect, useRef } from 'react';
import { buildPropertyPath } from '../../lib/api/properties';
import { track, EVENTS } from '../../lib/analytics';
import { buildDiscoveryEventProps, type DiscoveryModule, type DiscoverySurface } from '../../lib/discoveryJourney';
import { DiscoverySectionHeader } from './DiscoverySectionHeader';
import { PropertyCard } from '../property/PropertyCard';

// Một article render cả desktop/mobile variant trong HTML để tránh layout shift. Khóa
// theo tập tin hiển thị để đổi breakpoint không bắn thêm module-view cho cùng dữ liệu.
const viewedDiscoveryKeys = new Set<string>();

type PropertyDiscoveryItem = {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price: number;
  price_unit: string;
  price_label: string | null;
  price_per_month?: number | null;
  district: string | null;
  city: string;
  listing_type: string | null;
};

export function PropertyDiscoveryRail({
  title,
  subtitle,
  properties,
  surface,
  module,
  source,
  itemNote,
  empty = null,
  layout,
  headingId,
  viewKey,
}: {
  title: string;
  subtitle?: string;
  properties: PropertyDiscoveryItem[];
  surface: DiscoverySurface;
  module: DiscoveryModule;
  source: string;
  itemNote?: (property: PropertyDiscoveryItem) => string | undefined;
  empty?: React.ReactNode;
  layout?: 'rail' | 'sidebar';
  headingId?: string;
  viewKey?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const viewed = useRef(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || viewed.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || viewed.current) return;
      viewed.current = true;
      if (viewKey && viewedDiscoveryKeys.has(viewKey)) {
        observer.disconnect();
        return;
      }
      if (viewKey) viewedDiscoveryKeys.add(viewKey);
      track(EVENTS.DISCOVERY_MODULE_VIEW, buildDiscoveryEventProps({
        surface,
        module,
        itemCount: properties.length,
        source,
      }));
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [module, properties.length, source, surface, viewKey]);

  if (properties.length === 0) return empty;
  const sidebar = layout === 'sidebar';
  const resolvedHeadingId = headingId ?? `${module}-heading`;

  return (
    <section ref={sectionRef} className={sidebar ? 'mt-0' : 'mt-8'} aria-labelledby={resolvedHeadingId}>
      <DiscoverySectionHeader title={title} subtitle={subtitle} headingId={resolvedHeadingId} />
      <div className={sidebar
        ? 'space-y-3'
        : '-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [contain:layout] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 md:grid-cols-3 xl:grid-cols-4'}>
        {properties.map((property, index) => {
          const note = itemNote?.(property);
          const card = (
            <PropertyCard
              property={property}
              href={buildPropertyPath(property)}
              variant={sidebar ? 'compact' : 'grid'}
              onResultClick={() => track(EVENTS.DISCOVERY_MODULE_CLICK, buildDiscoveryEventProps({
                surface,
                module,
                position: index + 1,
                itemCount: properties.length,
                source,
                listingType: property.listing_type === 'mua_ban' || property.listing_type === 'cho_thue'
                  ? property.listing_type
                  : undefined,
              }))}
              note={note ? <span className="cnv-property-meta font-medium text-red-500">{note}</span> : undefined}
            />
          );
          return sidebar
            ? <div key={property.id}>{card}</div>
            : <div key={property.id} className="w-64 shrink-0 snap-start sm:w-auto">{card}</div>;
        })}
      </div>
    </section>
  );
}
