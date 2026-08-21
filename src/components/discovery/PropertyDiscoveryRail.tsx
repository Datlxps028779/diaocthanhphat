'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { buildPropertyPath } from '../../lib/api/properties';
import { FALLBACK_PROPERTY_IMAGE } from '../../lib/propertyImages';
import { SafeImage } from '../SafeImage';
import { track, EVENTS } from '../../lib/analytics';
import { buildDiscoveryEventProps, type DiscoveryModule, type DiscoverySurface } from '../../lib/discoveryJourney';
import { DiscoverySectionHeader } from './DiscoverySectionHeader';
type PropertyDiscoveryItem = {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price: number;
  price_unit: string;
  price_label: string | null;
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
}: {
  title: string;
  subtitle?: string;
  properties: PropertyDiscoveryItem[];
  surface: DiscoverySurface;
  module: DiscoveryModule;
  source: string;
  itemNote?: (property: PropertyDiscoveryItem) => string | undefined;
  empty?: React.ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const viewed = useRef(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || viewed.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || viewed.current) return;
      viewed.current = true;
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
  }, [module, properties.length, source, surface]);

  if (properties.length === 0) return empty;

  return (
    <section ref={sectionRef} className="mt-8" aria-labelledby={`${module}-heading`}>
      <DiscoverySectionHeader title={title} subtitle={subtitle} headingId={`${module}-heading`} />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 md:grid-cols-3 xl:grid-cols-4">
        {properties.map((property, index) => (
          <Link
            key={property.id}
            href={buildPropertyPath(property)}
            onClick={() => track(EVENTS.DISCOVERY_MODULE_CLICK, buildDiscoveryEventProps({
              surface,
              module,
              position: index + 1,
              itemCount: properties.length,
              source,
              listingType: property.listing_type === 'mua_ban' || property.listing_type === 'cho_thue'
                ? property.listing_type
                : undefined,
            }))}
            className="group flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:shadow-lg sm:w-auto"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
              <SafeImage
                src={property.image_url}
                fallbackSrc={FALLBACK_PROPERTY_IMAGE}
                alt={property.title}
                fill
                sizes="(max-width: 640px) 256px, (max-width: 768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {property.listing_type === 'cho_thue' && (
                <span className="absolute left-2 top-2 rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">Cho thuê</span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-3">
              <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover:text-red-600">{property.title}</h3>
              <p className="text-sm font-black text-red-600">{property.price_label ?? `${property.price} ${property.price_unit}`}</p>
              <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                <MapPin className="h-3 w-3 shrink-0 text-red-400" />
                <span className="truncate">{property.district ? `${property.district}, ` : ''}{property.city}</span>
              </div>
              {itemNote?.(property) && <p className="mt-1 line-clamp-1 text-[11px] font-medium text-red-500">{itemNote(property)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
