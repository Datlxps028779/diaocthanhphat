'use client';
import dynamic from 'next/dynamic';
import { SiteChrome } from '@/components/SiteChrome';
import { useNavigate } from '@/lib/useNavigate';
import type { ReactNode } from 'react';
import type { ListingInitialFilters } from '@/lib/api/properties';
import type { Property, NewsPageResult, ManagedPage, PageBlock } from '@/lib/supabase';

const ListingsPage = dynamic(() => import('@/screens/ListingsPage').then(m => m.ListingsPage));
const ProjectsPage = dynamic(() => import('@/screens/ProjectsPage').then(m => m.ProjectsPage));
const InvestPage = dynamic(() => import('@/screens/InvestPage').then(m => m.InvestPage));
const RegionsPage = dynamic(() => import('@/screens/RegionsPage').then(m => m.RegionsPage));
const NewsPage = dynamic(() => import('@/screens/NewsPage').then(m => m.NewsPage));
const AboutPage = dynamic(() => import('@/screens/AboutPage').then(m => m.AboutPage));
const ValuationPage = dynamic(() => import('@/screens/ValuationPage').then(m => m.ValuationPage));
const ComparePage = dynamic(() => import('@/screens/ComparePage').then(m => m.ComparePage));
const PostListingPage = dynamic(() => import('@/screens/PostListingPage').then(m => m.PostListingPage));
const AccountHubPage = dynamic(() => import('@/screens/AccountHubPage').then(m => m.AccountHubPage));
const StaticPageScreen = dynamic(() => import('@/screens/StaticPageScreen').then(m => m.StaticPageScreen));

export function ListingsClient({ listingType, filters, initialData }: {
  listingType?: 'mua_ban' | 'cho_thue';
  filters?: ListingInitialFilters;
  initialData?: { data: Property[]; total: number };
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'listings', listingType }}>
      <ListingsPage
        initialFilters={{ listingType, ...filters }}
        initialData={initialData}
        initialDataScope={{ listingType }}
        onNavigate={navigate}
      />
    </SiteChrome>
  );
}

// Trang khu vực theo listing-type (/cho-thue/binh-duong/di-an): khối nội dung tĩnh
// (server-render, truyền qua children) hiển thị TRÊN danh sách tin. Một SiteChrome
// duy nhất bọc cả hai — tránh lồng chrome khi tái dùng ListingsPage.
export function AreaListingClient({ listingType, filters, initialData, initialDataScope, header }: {
  listingType: 'mua_ban' | 'cho_thue';
  filters?: ListingInitialFilters;
  initialData?: { data: Property[]; total: number };
  initialDataScope?: ListingInitialFilters;
  header?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'listings', listingType }}>
      {header}
      <ListingsPage
        initialFilters={{ listingType, ...filters }}
        initialData={initialData}
        initialDataScope={initialDataScope}
        hasEditorialHeader={Boolean(header)}
        onNavigate={navigate}
      />
    </SiteChrome>
  );
}

export function ProjectsClient({ initialArea, initialPhase }: { initialArea?: string; initialPhase?: string } = {}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'projects' }}>
      <ProjectsPage onNavigate={navigate} initialArea={initialArea} initialPhase={initialPhase} />
    </SiteChrome>
  );
}

export function InvestClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'invest' }}>
      <InvestPage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function RegionsClient({ initialAreaId }: { initialAreaId?: string } = {}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'regions' }}>
      <RegionsPage onNavigate={navigate} initialAreaId={initialAreaId} />
    </SiteChrome>
  );
}

export function NewsListClient({ initialPage, initialCategory, initialMostViewed }: { initialPage?: NewsPageResult; initialCategory?: string; initialMostViewed?: NewsPageResult['data'] }) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'news' }}>
      <NewsPage onNavigate={navigate} initialPage={initialPage} initialCategory={initialCategory} initialMostViewed={initialMostViewed} />
    </SiteChrome>
  );
}

export function AboutClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'about' }}>
      <AboutPage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function StaticPageClient({ page, blocks }: { page: ManagedPage; blocks: PageBlock[] }) {
  return (
    <SiteChrome currentPage={{ name: 'home' }}>
      <StaticPageScreen page={page} blocks={blocks} />
    </SiteChrome>
  );
}

export function ValuationClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'valuation' }}>
      <ValuationPage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function CompareClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'compare' }}>
      <ComparePage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function PostListingClient({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'post-listing' }}>
      <PostListingPage onNavigate={navigate} editId={editId} />
    </SiteChrome>
  );
}

export function MyListingsClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'my-listings' }}>
      <AccountHubPage onNavigate={navigate} initialTab="listings" />
    </SiteChrome>
  );
}

export function AccountClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'account' }}>
      <AccountHubPage onNavigate={navigate} initialTab="favorites" />
    </SiteChrome>
  );
}
