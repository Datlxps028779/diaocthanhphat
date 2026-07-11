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
import { MyListingsPage } from '@/screens/MyListingsPage';
import { AccountPage } from '@/screens/AccountPage';
import type { Property, NewsArticle } from '@/lib/supabase';

export function ListingsClient({ listingType, filters, initialData }: {
  listingType?: 'mua_ban' | 'cho_thue';
  filters?: { typeId?: string; district?: string; legal?: string };
  initialData?: { data: Property[]; total: number };
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'listings', listingType }}>
      <ListingsPage initialFilters={{ listingType, ...filters }} initialData={initialData} onNavigate={navigate} />
    </SiteChrome>
  );
}

export function ProjectsClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'projects' }}>
      <ProjectsPage onNavigate={navigate} />
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

export function RegionsClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'regions' }}>
      <RegionsPage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function NewsListClient({ initialArticles }: { initialArticles?: NewsArticle[] }) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'news' }}>
      <NewsPage onNavigate={navigate} initialArticles={initialArticles} />
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

export function PostListingClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'post-listing' }}>
      <PostListingPage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function MyListingsClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'my-listings' }}>
      <MyListingsPage onNavigate={navigate} />
    </SiteChrome>
  );
}

export function AccountClient() {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'account' }}>
      <AccountPage onNavigate={navigate} />
    </SiteChrome>
  );
}
