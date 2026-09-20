import type { Property } from './supabase';
import { formatPropertyPrice, getEffectiveListingPrice, priceToVnd } from './listingPrice';
import { formatPricePerSqm, formatUpdateDate } from './priceStatsFormat';
import { normalizeListingTitle } from './listingTitle';
import { buildProductPath } from './productPath';
import { classifyPropertySegment } from './propertySpecs';
import { normalizePublicHref, normalizePublicImageUrl } from './siteUrl';

export type PropertyCardSource = Pick<Property, 'id' | 'title'> & Partial<Omit<Property,
  'id' | 'title' | 'property_types' | 'areas' | 'listing_type' | 'contact_name' | 'contact_phone' | 'contact_zalo'
>> & {
  listing_type?: string | null;
  property_types?: { name?: string | null; slug?: string | null } | null;
  areas?: { slug?: string | null } | null;
  property_type_name?: string | null;
  property_type_slug?: string | null;
  area_slug?: string | null;
  readonly cardPoster?: PublicCardPoster;
};

export type PublicCardPoster = {
  displayName: string;
  avatarUrl?: string | null;
  profileSlug?: string | null;
  source: 'published-profile';
  propertyId: string;
};

export const UNKNOWN_CARD_POSTER = 'Chưa có thông tin người đăng';

const positive = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value > 0;

export function formatPropertyPricePerSqm(source: PropertyCardSource): string | null {
  const effective = getEffectiveListingPrice(source);
  if (source.listing_type !== 'mua_ban' || effective.unit === 'triệu/tháng' || !positive(source.area_sqm)) return null;
  const vnd = priceToVnd(source);
  if (!positive(vnd)) return null;
  const perSqm = vnd / source.area_sqm;
  if (!positive(perSqm)) return null;
  const millions = perSqm / 1_000_000;
  if (millions < 0.1) {
    return perSqm < 1 ? '< 1 đ/m²' : `≈ ${Math.round(perSqm).toLocaleString('vi-VN')} đ/m²`;
  }
  return `≈ ${formatPricePerSqm(millions)}`;
}

function imageUrl(raw: string | null | undefined): string {
  return normalizePublicHref(normalizePublicImageUrl(raw));
}

function addressPartKey(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN').replace(/^(phường|xã|thị trấn|quận|huyện|thị xã|thành phố|tỉnh)\s+/, '');
}

function cardAddress(source: PropertyCardSource): string {
  const parts: string[] = [];
  for (const raw of [source.address, source.ward, source.district, source.city]) {
    const part = raw?.trim();
    if (part && !parts.some(previous => previous.split(',').some(segment => addressPartKey(segment) === addressPartKey(part)))) parts.push(part);
  }
  return parts.join(', ') || source.formatted_address?.trim() || 'Chưa cung cấp địa chỉ';
}

export function buildPropertyCardModel(source: PropertyCardSource, poster: PublicCardPoster | null | undefined = source.cardPoster) {
  const type = source.property_types ?? { name: source.property_type_name, slug: source.property_type_slug };
  const segment = classifyPropertySegment(type);
  const roomLabels: string[] = [];
  if (segment === 'house' || segment === 'apartment' || segment === 'other') {
    if (positive(source.bedrooms)) roomLabels.push(`${source.bedrooms.toLocaleString('vi-VN')} phòng ngủ`);
    else if (segment !== 'other') roomLabels.push('Chưa cung cấp phòng ngủ');
    if (positive(source.bathrooms)) roomLabels.push(`${source.bathrooms.toLocaleString('vi-VN')} phòng tắm`);
    else if (segment !== 'other') roomLabels.push('Chưa cung cấp phòng tắm');
  }
  const images = [...new Set([source.image_url, ...(source.images ?? [])].map(imageUrl).filter(Boolean))];
  const postedDate = formatUpdateDate(source.created_at);
  const identified = poster?.source === 'published-profile' && poster.propertyId === source.id && Boolean(poster.displayName.trim());
  return {
    id: source.id,
    href: buildProductPath({ ...source, areas: source.areas ?? (source.area_slug ? { slug: source.area_slug } : null) }),
    navSlug: source.slug ?? null,
    title: normalizeListingTitle(source.title).value || 'Chưa cung cấp tiêu đề',
    price: formatPropertyPrice(source),
    pricePerSqm: formatPropertyPricePerSqm(source),
    transaction: source.listing_type === 'cho_thue' ? 'Cho thuê' : source.listing_type === 'mua_ban' ? 'Mua bán' : 'Bất động sản',
    typeLabel: type?.name?.trim() || 'Chưa cung cấp loại hình',
    areaLabel: positive(source.area_sqm) ? `${source.area_sqm.toLocaleString('vi-VN')} m²` : 'Chưa cung cấp diện tích',
    roomLabels,
    legalLabel: source.legal_status?.trim() || 'Chưa cung cấp pháp lý',
    address: cardAddress(source),
    postedLabel: postedDate ? `Đăng ngày ${postedDate}` : 'Chưa cung cấp ngày đăng',
    postedAt: postedDate ? source.created_at! : null,
    poster: {
      name: identified ? poster!.displayName.trim() : UNKNOWN_CARD_POSTER,
      avatarUrl: identified ? imageUrl(poster!.avatarUrl) || null : null,
      href: identified && poster!.profileSlug?.trim() ? `/nguoi-dang-tin/${encodeURIComponent(poster!.profileSlug.trim())}` : null,
      identified: Boolean(identified),
    },
    imageCount: images.length,
    images,
  };
}

export type PropertyCardModel = ReturnType<typeof buildPropertyCardModel>;
