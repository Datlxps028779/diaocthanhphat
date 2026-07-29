'use client';
import { SiteChrome } from '@/components/SiteChrome';
import { useNavigate } from '@/lib/useNavigate';
import { ListingsPage } from '@/screens/ListingsPage';
import { ProjectsPage } from '@/screens/ProjectsPage';
import { InvestPage } from '@/screens/InvestPage';
import { RegionsPage } from '@/screens/RegionsPage';
import { NewsPage } from '@/screens/NewsPage';
import { AboutPage } from '@/screens/AboutPage';
import { ValuationPage } from '@/screens/ValuationPage';
import { ComparePage } from '@/screens/ComparePage';
import { PostListingPage } from '@/screens/PostListingPage';
import { AccountHubPage } from '@/screens/AccountHubPage';
import { StaticPageScreen } from '@/screens/StaticPageScreen';
import type { ReactNode } from 'react';
import type { Property, NewsArticle, ManagedPage, PageBlock } from '@/lib/supabase';

export function ListingsClient({ listingType, filters, initialData }: {
  listingType?: 'mua_ban' | 'cho_thue';
  filters?: { typeId?: string; district?: string; ward?: string; legal?: string; areaId?: string; keyword?: string; minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number; bedrooms?: string; direction?: string; page?: number };
  initialData?: { data: Property[]; total: number };
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'listings', listingType }}>
      <ListingsPage initialFilters={{ listingType, ...filters }} initialData={initialData} onNavigate={navigate} />
    </SiteChrome>
  );
}

// Trang khu vực theo listing-type (/cho-thue/binh-duong/di-an): khối nội dung tĩnh
// (server-render, truyền qua children) hiển thị TRÊN danh sách tin. Một SiteChrome
// duy nhất bọc cả hai — tránh lồng chrome khi tái dùng ListingsPage.
export function AreaListingClient({ listingType, filters, initialData, header }: {
  listingType: 'mua_ban' | 'cho_thue';
  filters?: { typeId?: string; district?: string; ward?: string; legal?: string; areaId?: string; keyword?: string; minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number; bedrooms?: string; direction?: string; page?: number };
  initialData?: { data: Property[]; total: number };
  header?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'listings', listingType }}>
      {header}
      <ListingsPage initialFilters={{ listingType, ...filters }} initialData={initialData} onNavigate={navigate} />
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

export function NewsListClient({ initialArticles, initialCategory }: { initialArticles?: NewsArticle[]; initialCategory?: string }) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'news' }}>
      <NewsPage onNavigate={navigate} initialArticles={initialArticles} initialCategory={initialCategory} />
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
