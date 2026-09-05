import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { SafeImage } from '@/components/SafeImage';
import { SiteChrome } from '@/components/SiteChrome';
import { buildZaloHref } from '@/lib/zalo';
import {
  buildAgentProfileItemListJsonLd,
  buildAgentProfileJsonLd,
  buildAgentProfileMetadata,
  buildAgentProfileSummary,
} from '@/lib/agentProfileSeo';
import { serverGetPublicAgentProfile, serverGetPublicAgentProfileListings } from '@/lib/supabase-server';
import type { PublicAgentListing, PublicAgentProfile } from '@/lib/supabase';
import { AgentProfileListings } from './AgentProfileListings';
import { agentProfilePath } from '@/lib/agentProfileSeo';

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

function AgentProfileContent({ profile, listings }: AgentProfileData) {
  const summary = buildAgentProfileSummary(profile, listings);
  const zaloHref = buildZaloHref(profile.public_zalo);
  return (
    <main className="bg-gray-50">
      <section className="bg-gray-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
          <nav className="mb-7 text-xs text-white/70">
            <Link href="/" className="hover:text-white">Trang chủ</Link>
            <span className="mx-2">/</span>
            <Link href="/danh-sach" className="hover:text-white">Bất động sản</Link>
            <span className="mx-2">/</span>
            <span className="text-white">Người đăng tin</span>
          </nav>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-3xl bg-red-100 ring-4 ring-white/10 sm:h-28 sm:w-28">
              {profile.avatar_url ? (
                <SafeImage src={profile.avatar_url} alt={profile.display_name} width={112} height={112} className="h-full w-full object-cover" fallbackSrc="/placeholder-property.svg" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-black text-red-600">{initials(profile.display_name)}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Hồ sơ người đăng tin</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">{profile.display_name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75">{summary}</p>
              <div className="relative z-[61] mt-5 flex flex-col gap-2 text-xs font-semibold sm:flex-row sm:flex-wrap">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-center">{listings.length} tin đang hiển thị</span>
                {listings.length > 0 && <a href="#agent-listings" className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-center text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">Xem tin đăng</a>}
                {profile.public_phone && <a href={`tel:${profile.public_phone.replace(/\s/g, '')}`} className="rounded-full bg-red-600 px-3 py-2 text-center text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">Gọi {profile.public_phone}</a>}
                {zaloHref && <a href={zaloHref} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-3 py-2 text-center hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">Nhắn Zalo</a>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="agent-listings" className="mx-auto max-w-7xl scroll-mt-6 px-4 py-8 md:py-10">
        <AgentProfileListings listings={listings} />
      </section>
    </main>
  );
}

export default async function AgentProfilePage({ params }: Props) {
  const requestedSlug = decodeURIComponent(params.slug);
  const data = await loadAgentProfile(requestedSlug);
  if (!data) notFound();
  if (data.profile.slug !== requestedSlug) redirect(agentProfilePath(data.profile.slug));
  const itemList = buildAgentProfileItemListJsonLd(data.profile, data.listings);
  return (
    <>
      <JsonLdScripts schemas={[buildAgentProfileJsonLd(data.profile), itemList]} />
      <SiteChrome currentPage={{ name: 'home' }} profilePage>
        <AgentProfileContent profile={data.profile} listings={data.listings} />
      </SiteChrome>
    </>
  );
}
