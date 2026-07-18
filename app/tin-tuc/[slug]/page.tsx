import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetNewsByIdOrSlug } from '@/lib/supabase-server';
import { buildNewsMetadata, buildArticleJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { NewsDetailClient } from './NewsDetailClient';

export const revalidate = 3600;

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = await serverGetNewsByIdOrSlug(decodeURIComponent(params.slug));
  if (!article) return { title: 'Không tìm thấy bài viết' };
  return buildNewsMetadata(article);
}

export default async function NewsArticlePage({ params }: Params) {
  const article = await serverGetNewsByIdOrSlug(decodeURIComponent(params.slug));
  if (!article) notFound();

  const jsonLd = buildArticleJsonLd(article);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    { name: article.title, path: `/tin-tuc/${article.slug || article.id}` },
  ]);

  return (
    <>
      <JsonLdScripts schemas={[jsonLd, breadcrumbJsonLd]} />
      {/* NewsPage tra chi tiết theo id (UUID) — truyền article.id đã resolve từ slug */}
      <NewsDetailClient articleId={article.id} />
    </>
  );
}
