import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetNewsByIdOrSlug, serverGetSiteSettings } from '@/lib/supabase-server';
import { buildNewsMetadata, buildArticleJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { buildFaqJsonLd } from '@/lib/propertyFaq';
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

  const settings = await serverGetSiteSettings();
  const jsonLd = buildArticleJsonLd(article, settings);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    { name: article.title, path: `/tin-tuc/${article.slug || article.id}` },
  ]);
  // FAQPage chỉ emit khi bài có FAQ nhập tay (khớp khối FAQ visible trong ArticleDetail).
  const faqJsonLd = buildFaqJsonLd(article.faq ?? []);
  const schemas = [jsonLd, breadcrumbJsonLd, ...(faqJsonLd ? [faqJsonLd] : [])];

  return (
    <>
      <JsonLdScripts schemas={schemas} />
      {/* NewsPage tra chi tiết theo id (UUID) — truyền article.id đã resolve từ slug */}
      <NewsDetailClient articleId={article.id} />
    </>
  );
}
