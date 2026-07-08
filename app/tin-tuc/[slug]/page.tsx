import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetNewsByIdOrSlug } from '@/lib/supabase-server';
import { buildNewsMetadata, buildArticleJsonLd } from '@/lib/seo';
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* NewsPage tra chi tiết theo id (UUID) — truyền article.id đã resolve từ slug */}
      <NewsDetailClient articleId={article.id} />
    </>
  );
}
