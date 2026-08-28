import { formatPropertyPrice, type ListingPriceSource } from '../lib/listingPrice';

type ListingPriceProps = {
  source: ListingPriceSource;
  variant?: 'card' | 'detail' | 'compact' | 'admin';
  className?: string;
};

const VARIANT_CLASS: Record<NonNullable<ListingPriceProps['variant']>, string> = {
  card: 'text-base font-black text-red-600',
  detail: 'text-3xl font-black text-red-600',
  compact: 'text-xs font-black text-red-600',
  admin: 'text-sm font-bold text-red-600',
};

export function ListingPrice({ source, variant = 'card', className = '' }: ListingPriceProps) {
  return <p className={`${VARIANT_CLASS[variant]} ${className}`.trim()}>{formatPropertyPrice(source)}</p>;
}
