import type { ListingType } from './supabase';

export function buildListingResultLabel(input: {
  propertyTypeName?: string | null;
  listingType?: ListingType | '';
  areaName?: string | null;
  district?: string | null;
  ward?: string | null;
}): string {
  const transaction = input.listingType === 'mua_ban'
    ? 'bán'
    : input.listingType === 'cho_thue'
      ? 'cho thuê'
      : '';
  const location = input.ward || input.district || input.areaName || '';
  const subject = input.propertyTypeName?.trim() || 'bất động sản';

  return [subject, transaction, location].filter(Boolean).join(' ');
}

export function listingEmptyStateGuidance(listingType: ListingType | ''): string {
  return listingType === 'cho_thue'
    ? 'Thử gỡ bớt bộ lọc hoặc tìm bất động sản cho thuê khác'
    : 'Thử gỡ bớt bộ lọc hoặc dùng từ khóa tìm kiếm khác';
}
