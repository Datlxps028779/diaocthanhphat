import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NewsListClient } from '../../../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';
import { slugToCategory, NEWS_CATEGORY_SLUGS } from '@/lib/newsCategories';
import { loadRouteSeo, type RouteFallback } from '@/lib/routeSeo';
import { JsonLdScripts } from '@/components/JsonLdScripts';

export const revalidate = 1800;

// Pre-render sẵn 5 danh mục cố định để có HTML tĩnh + vào sitemap.
export function generateStaticParams() {
  return NEWS_CATEGORY_SLUGS.map((slug) => ({ slug }));
}

type Params = { params: { slug: string } };

function categoryFallback(slug: string, category: string): RouteFallback {
  const path = `/tin-tuc/danh-muc/${slug}`;
  return {
    title: `Tin ${category} bất động sản`,
    description: `Tin tức, phân tích ${category.toLowerCase()} bất động sản tại Bình Dương và khu vực lân cận.`,
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
  const category = slugToCategory(params.slug);
  if (!category) return { title: 'Không tìm thấy danh mục' };
  const path = `/tin-tuc/danh-muc/${params.slug}`;
  const { metadata } = await loadRouteSeo(path, categoryFallback(params.slug, category));
  return metadata;
}

export default async function NewsCategoryPage({ params }: Params) {
  const category = slugToCategory(params.slug);
  if (!category) notFound();

  const path = `/tin-tuc/danh-muc/${params.slug}`;
  const [articles, { jsonLd }] = await Promise.all([
    serverGetNews(20, category),
    loadRouteSeo(path, categoryFallback(params.slug, category)),
  ]);

  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <NewsListClient initialArticles={articles} initialCategory={category} />
    </>
  );
}
