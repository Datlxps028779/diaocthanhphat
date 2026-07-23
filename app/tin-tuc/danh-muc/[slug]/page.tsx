import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NewsListClient } from '../../../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';
import { slugToCategory, NEWS_CATEGORY_SLUGS } from '@/lib/newsCategories';
import { buildBreadcrumbJsonLd } from '@/lib/seo';
import { JsonLdScripts } from '@/components/JsonLdScripts';

export const revalidate = 1800;

// Pre-render sẵn 5 danh mục cố định để có HTML tĩnh + vào sitemap.
export function generateStaticParams() {
  return NEWS_CATEGORY_SLUGS.map((slug) => ({ slug }));
}

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const category = slugToCategory(params.slug);
  if (!category) return { title: 'Không tìm thấy danh mục' };
  const title = `Tin ${category} bất động sản`;
  const description = `Tin tức, phân tích ${category.toLowerCase()} bất động sản tại Bình Dương và khu vực lân cận.`;
  const path = `/tin-tuc/danh-muc/${params.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: 'website' },
  };
}

export default async function NewsCategoryPage({ params }: Params) {
  const category = slugToCategory(params.slug);
  if (!category) notFound();

  const articles = await serverGetNews(20, category);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    { name: category, path: `/tin-tuc/danh-muc/${params.slug}` },
  ]);

  return (
    <>
      <JsonLdScripts schemas={[breadcrumbJsonLd]} />
      <NewsListClient initialArticles={articles} initialCategory={category} />
    </>
  );
}
