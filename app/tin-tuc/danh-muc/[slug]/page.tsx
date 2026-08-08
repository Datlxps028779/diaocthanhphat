import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NewsListClient } from '../../../_clients/pageClients';
import { serverGetNewsPage, serverGetMostViewedNews, serverGetNewsCategories } from '@/lib/supabase-server';
import { loadRouteSeo, type RouteFallback } from '@/lib/routeSeo';
import { JsonLdScripts } from '@/components/JsonLdScripts';

export const revalidate = 1800;

// Pre-render danh mục theo DB (news_categories). Fallback danh sách tĩnh khi bảng rỗng
// (serverGetNewsCategories tự lo). ISR revalidate → danh mục mới hiện sau chu kỳ.
export async function generateStaticParams() {
  const cats = await serverGetNewsCategories();
  return cats.filter(c => c.slug).map((c) => ({ slug: c.slug }));
}

type Params = { params: { slug: string } };

// Tra danh mục theo slug từ DB. Trả cả seo_description để dựng metadata sát người biên tập.
async function resolveCategory(slug: string): Promise<{ label: string; seo_description: string | null } | null> {
  const cats = await serverGetNewsCategories();
  const found = cats.find(c => c.slug === slug);
  return found ? { label: found.label, seo_description: found.seo_description } : null;
}

function categoryFallback(slug: string, category: string, seoDescription?: string | null): RouteFallback {
  const path = `/tin-tuc/danh-muc/${slug}`;
  return {
    title: `Tin ${category} bất động sản`,
    description: seoDescription?.trim() || `Tin tức, phân tích ${category.toLowerCase()} bất động sản tại Bình Dương và khu vực lân cận.`,
    path,
    routeType: 'CollectionPage',
    breadcrumb: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Tin tức', path: '/tin-tuc' },
      { name: category, path },
    ],
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const cat = await resolveCategory(params.slug);
  if (!cat) return { title: 'Không tìm thấy danh mục' };
  const path = `/tin-tuc/danh-muc/${params.slug}`;
  const { metadata } = await loadRouteSeo(path, categoryFallback(params.slug, cat.label, cat.seo_description));
  return metadata;
}

export default async function NewsCategoryPage({ params }: Params) {
  const cat = await resolveCategory(params.slug);
  if (!cat) notFound();
  const category = cat.label;

  const path = `/tin-tuc/danh-muc/${params.slug}`;
  const [initialPage, initialMostViewed, { jsonLd }] = await Promise.all([
    serverGetNewsPage({ category, page: 1 }),
    serverGetMostViewedNews(8),
    loadRouteSeo(path, categoryFallback(params.slug, category, cat.seo_description)),
  ]);

  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <NewsListClient initialPage={initialPage} initialMostViewed={initialMostViewed} initialCategory={category} />
    </>
  );
}
