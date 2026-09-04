import type { Metadata } from 'next';
import type { PublicAgentListing, PublicAgentProfile } from './supabase';
import { absoluteUrl, normalizePublicImageUrl } from './siteUrl';
import { buildProductPath } from './productPath';
import { FALLBACK_PROPERTY_IMAGE } from './propertyImages';
import { SITE_IDENTITY } from './siteIdentity';

export function agentProfilePath(slug: string): string {
  return `/nguoi-dang-tin/${encodeURIComponent(slug)}`;
}

export function isAgentProfileIndexable(listingCount: number): boolean {
  return listingCount > 0;
}

export function buildAgentProfileMetadata(profile: PublicAgentProfile, listingCount: number): Metadata {
  const title = `${profile.display_name} | Người đăng tin BĐS | ${SITE_IDENTITY.name}`;
  const description = profile.bio?.trim()
    || `Xem hồ sơ và các tin đăng bất động sản của ${profile.display_name} trên ${SITE_IDENTITY.name}.`;
  const path = agentProfilePath(profile.slug);
  const image = normalizePublicImageUrl(profile.avatar_url) || FALLBACK_PROPERTY_IMAGE;
  const indexable = isAgentProfileIndexable(listingCount);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: absoluteUrl(path),
      siteName: SITE_IDENTITY.name,
      locale: 'vi_VN',
      images: [{ url: image, width: 1200, height: 630, alt: profile.display_name }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export function buildAgentProfileJsonLd(profile: PublicAgentProfile): Record<string, unknown> {
  const path = agentProfilePath(profile.slug);
  const image = normalizePublicImageUrl(profile.avatar_url);
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${absoluteUrl(path)}#profilepage`,
    url: absoluteUrl(path),
    name: profile.display_name,
    mainEntity: {
      '@type': 'Person',
      '@id': `${absoluteUrl(path)}#person`,
      name: profile.display_name,
      ...(profile.bio?.trim() ? { description: profile.bio.trim() } : {}),
      ...(image ? { image } : {}),
      ...(profile.public_phone?.trim() ? { telephone: profile.public_phone.trim() } : {}),
      url: absoluteUrl(path),
    },
  };
}

export function buildAgentProfileItemListJsonLd(
  profile: PublicAgentProfile,
  listings: PublicAgentListing[],
): Record<string, unknown> | null {
  if (listings.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Tin đăng của ${profile.display_name}`,
    numberOfItems: listings.length,
    itemListElement: listings.map((listing, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(buildProductPath({
        id: listing.id,
        slug: listing.slug,
        public_code: listing.public_code,
        listing_type: listing.listing_type,
        district: listing.district,
        areas: { slug: listing.area_slug ?? undefined },
      })),
      name: listing.title,
    })),
  };
}

export function buildAgentProfileSummary(profile: PublicAgentProfile, listings: PublicAgentListing[]): string {
  if (profile.bio?.trim()) return profile.bio.trim();
  return `${profile.display_name} có ${listings.length} tin đăng bất động sản đang hiển thị trên ${SITE_IDENTITY.name}.`;
}
