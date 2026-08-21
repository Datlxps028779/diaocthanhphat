import type { ListingType, Property } from './supabase';

export type RelatedProperty = Property & {
  relatedReason: string;
};

type RelatedPropertySource = Omit<
  Pick<
    Property,
    | 'id'
    | 'listing_type'
    | 'area_id'
    | 'district'
    | 'property_type_id'
    | 'property_types'
    | 'price'
    | 'price_per_month'
    | 'area_sqm'
    | 'bedrooms'
    | 'legal_status'
    | 'created_at'
  >,
  'property_types'
> & {
  property_types?: { name: string } | null;
};

function normalizedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLocaleLowerCase('vi-VN') : null;
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizedText(left);
  const b = normalizedText(right);
  return Boolean(a && b && a === b);
}

function priceOf(property: RelatedPropertySource): number | null {
  const value = property.listing_type === 'cho_thue' ? property.price_per_month : property.price;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function relativeDifference(left: number | null, right: number | null): number {
  if (left == null || right == null) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / Math.max(left, right, 1);
}

function tierOf(current: RelatedPropertySource, candidate: RelatedPropertySource): number {
  const sameArea = Boolean(current.area_id && candidate.area_id && current.area_id === candidate.area_id);
  const sameDistrict = sameArea && sameText(current.district, candidate.district);
  const sameType = Boolean(
    current.property_type_id
    && candidate.property_type_id
    && current.property_type_id === candidate.property_type_id,
  );

  if (sameDistrict && sameType) return 0;
  if (sameDistrict) return 1;
  if (sameArea && sameType) return 2;
  if (sameArea) return 3;
  if (sameType) return 4;
  return 5;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Lý do chỉ nói về trường hiện có và bằng nhau. Không biến "gần giá" thành một
// claim hiển thị vì khách không thể kiểm chứng nó chỉ từ nhãn card.
export function buildRelatedPropertyReason(
  current: RelatedPropertySource,
  candidate: RelatedPropertySource,
): string {
  const labels: string[] = [];
  const sameArea = Boolean(current.area_id && candidate.area_id && current.area_id === candidate.area_id);
  if (sameArea && sameText(current.district, candidate.district) && current.district?.trim()) {
    labels.push(`Cùng ${current.district.trim()}`);
  }
  if (
    current.property_type_id
    && candidate.property_type_id === current.property_type_id
    && current.property_types?.name?.trim()
  ) {
    labels.push(`Cùng loại ${current.property_types.name.trim()}`);
  }
  if (sameText(current.legal_status, candidate.legal_status) && current.legal_status?.trim()) {
    labels.push(`Cùng pháp lý ${current.legal_status.trim()}`);
  }
  return labels.slice(0, 2).join(' · ');
}

// Xếp theo tầng quan hệ trước: cùng quận + loại → cùng quận → cùng tỉnh + loại →
// cùng tỉnh → cùng loại ở tỉnh khác. Trong mỗi tầng, giá/diện tích gần hơn đứng
// trước; các field trống không được coi là khớp. Hậu tố thời gian + id giữ thứ tự ổn
// định khi các tiêu chí giống nhau.
export function rankRelatedProperties<T extends RelatedPropertySource>(
  current: T,
  candidates: T[],
  limit = 6,
): Array<T & { relatedReason: string }> {
  if (limit <= 0 || (current.listing_type !== 'mua_ban' && current.listing_type !== 'cho_thue')) return [];

  const seen = new Set<string>([current.id]);
  const compatible = candidates.filter(candidate => {
    if (seen.has(candidate.id) || candidate.listing_type !== current.listing_type) return false;
    seen.add(candidate.id);
    return true;
  });
  const currentPrice = priceOf(current);

  return compatible
    .map(candidate => ({
      candidate,
      tier: tierOf(current, candidate),
      priceDifference: relativeDifference(currentPrice, priceOf(candidate)),
      areaDifference: relativeDifference(current.area_sqm, candidate.area_sqm),
      legalMismatch: sameText(current.legal_status, candidate.legal_status) ? 0 : 1,
      bedroomMismatch: current.bedrooms != null && candidate.bedrooms != null && current.bedrooms === candidate.bedrooms ? 0 : 1,
    }))
    .sort((left, right) => (
      left.tier - right.tier
      || left.priceDifference - right.priceDifference
      || left.areaDifference - right.areaDifference
      || left.legalMismatch - right.legalMismatch
      || left.bedroomMismatch - right.bedroomMismatch
      || timestamp(right.candidate.created_at) - timestamp(left.candidate.created_at)
      || left.candidate.id.localeCompare(right.candidate.id)
    ))
    .slice(0, limit)
    .map(({ candidate }) => ({
      ...candidate,
      relatedReason: buildRelatedPropertyReason(current, candidate),
    }));
}

export function mergeRelatedPropertyCandidates<T extends { id: string }>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  return groups.flat().filter(candidate => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export function isRelatedListingType(value: string | null | undefined): value is ListingType {
  return value === 'mua_ban' || value === 'cho_thue';
}
