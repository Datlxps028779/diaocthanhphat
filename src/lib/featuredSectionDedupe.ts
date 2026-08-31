import type { Property } from './supabase';

export type FeaturedSectionProperties = {
  section: { id: string };
  properties: Property[];
};

export function dedupeFeaturedSectionProperties<T extends FeaturedSectionProperties>(
  sections: T[],
): T[] {
  const claimed = new Set<string>();
  return sections.map(entry => {
    const properties = entry.properties.filter(property => {
      if (claimed.has(property.id)) return false;
      claimed.add(property.id);
      return true;
    });
    return { ...entry, properties };
  }).filter(entry => entry.properties.length > 0);
}
