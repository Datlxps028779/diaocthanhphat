import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { SafeImage } from '@/components/SafeImage';
import { SiteChrome } from '@/components/SiteChrome';
import { buildProductPath } from '@/lib/productPath';
import {
  buildAgentProfileItemListJsonLd,
  buildAgentProfileJsonLd,
  buildAgentProfileMetadata,
  buildAgentProfileSummary,
} from '@/lib/agentProfileSeo';
import { formatPropertyPrice } from '@/lib/listingPrice';
import { serverGetPublicAgentProfile, serverGetPublicAgentProfileListings } from '@/lib/supabase-server';
import type { PublicAgentListing, PublicAgentProfile } from '@/lib/supabase';

export const revalidate = 3600;

type Props = { params: { slug: string } };

type AgentProfileData = {
  profile: PublicAgentProfile;
  listings: PublicAgentListing[];
};

async function loadAgentProfile(slug: string): Promise<AgentProfileData | null> {
  const profile = await serverGetPublicAgentProfile(slug);
  if (!profile) return null;
  const listings = await serverGetPublicAgentProfileListings(profile.slug);
  return { profile, listings };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadAgentProfile(decodeURIComponent(params.slug));
  if (!data) return { title: 'Không tìm thấy hồ sơ người đăng tin' };
  return buildAgentProfileMetadata(data.profile, data.listings.length);
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'N';
}

function listingLocation(listing: PublicAgentListing): string {
  return [listing.district, listing.city].filter(Boolean).join(', ');
}

function AgentListingCard({ listing }: { listing: PublicAgentListing }) {
  const href = buildProductPath({
    id: listing.id,
    slug: listing.slug,
    public_code: listing.public_code,
    listing_type: listing.listing_type,
    district: listing.district,
    areas: { slug: listing.area_slug ?? undefined },
  });
  const image = listing.image_url || listing.images?.[0] || null;
  const location = listingLocation(listing);
  return (
    <Link href={href} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative h-48 overflow-hidden bg-gray-100">
        {image ? (
          <SafeImage src={image} alt={listing.title} width={640} height={384} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" fallbackSrc="/placeholder-property.svg" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-gray-400">Chưa có ảnh</div>
        )}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${listing.listing_type === 'cho_thue' ? 'bg-blue-600' : 'bg-red-600'}`}>
          {listing.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán'}
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h2 className="line-clamp-2 text-sm font-bold text-gray-900 group-hover:text-red-600">{listing.title}</h2>
        <p className="text-base font-black text-red-600">{formatPropertyPrice(listing)}</p>
        {location && <p className="truncate text-xs text-gray-500">{location}</p>}
        {listing.area_sqm && <p className="text-xs text-gray-500">Diện tích {listing.area_sqm} m²</p>}
      </div>
    </Link>
  );
}

function AgentProfileContent({ profile, listings }: AgentProfileData) {
  const summary = buildAgentProfileSummary(profile, listings);
  return (
    <main className="bg-gray-50">
      <section className="bg-gray-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-14">
          <nav className="mb-6 text-xs text-white/70">
            <Link href="/" className="hover:text-white">Trang chủ</Link>
            <span className="mx-2">/</span>
            <Link href="/danh-sach" className="hover:text-white">Bất động sản</Link>
            <span className="mx-2">/</span>
            <span className="text-white">Người đăng tin</span>
          </nav>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-red-100 ring-4 ring-white/10">
              {profile.avatar_url ? (
                <SafeImage src={profile.avatar_url} alt={profile.display_name} width={96} height={96} className="h-full w-full object-cover" fallbackSrc="/placeholder-property.svg" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-black text-red-600">{initials(profile.display_name)}</div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-300">Hồ sơ người đăng tin</p>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">{profile.display_name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">{summary}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white/10 px-3 py-1.5">{listings.length} tin đang hiển thị</span>
                {profile.public_phone && <a href={`tel:${profile.public_phone}`} className="rounded-full bg-red-600 px-3 py-1.5 text-white hover:bg-red-700">Gọi {profile.public_phone}</a>}
                {profile.public_zalo && <span className="rounded-full bg-white/10 px-3 py-1.5">Zalo: {profile.public_zalo}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 md:py-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-600">Tin đăng</p>
            <h2 className="mt-1 text-2xl font-black text-gray-900">Bất động sản đang hiển thị</h2>
          </div>
          <span className="text-sm text-gray-500">{listings.length} tin</span>
        </div>
        {listings.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map(listing => <AgentListingCard key={listing.id} listing={listing} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500">
            Hồ sơ chưa có tin đăng đang hiển thị.
          </div>
        )}
      </section>
    </main>
  );
}

export default async function AgentProfilePage({ params }: Props) {
  const data = await loadAgentProfile(decodeURIComponent(params.slug));
  if (!data) notFound();
  const itemList = buildAgentProfileItemListJsonLd(data.profile, data.listings);
  return (
    <>
      <JsonLdScripts schemas={[buildAgentProfileJsonLd(data.profile), itemList]} />
      <SiteChrome currentPage={{ name: 'home' }}>
        <AgentProfileContent profile={data.profile} listings={data.listings} />
      </SiteChrome>
    </>
  );
}
