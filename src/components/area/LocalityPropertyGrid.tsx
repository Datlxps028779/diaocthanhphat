import type { Property } from '@/lib/supabase';
import { PropertyCard } from '@/components/property/PropertyCard';
import styles from './localityVisual.module.css';

export function LocalityPropertyGrid({ properties }: { properties: Property[] }) {
  if (!properties.length) return <p className="border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm leading-6 text-gray-600">Chưa có tin công khai trong phạm vi này. Bạn có thể khám phá các địa phương khác hoặc quay lại sau.</p>;
  return <div className={`${styles.scope} grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3`}>
    {properties.map(property => <PropertyCard key={property.id} property={property} />)}
  </div>;
}
