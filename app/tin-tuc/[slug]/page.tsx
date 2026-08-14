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
  // JSON-LD chỉ để SEO — dữ liệu jsonb (faq/citations) lỡ sai kiểu KHÔNG được làm sập
  // trang bài viết. Bọc try/catch: hỏng schema thì bỏ qua, trang vẫn render.
  let schemas: Record<string, unknown>[] = [];
  try {
    const jsonLd = buildArticleJsonLd(article, settings);
    const breadcrumbJsonLd = buildBreadcrumbJsonLd([
      { name: 'Trang chủ', path: '/' },
      { name: 'Tin tức', path: '/tin-tuc' },
      { name: article.title, path: `/tin-tuc/${article.slug || article.id}` },
    ]);
    // FAQPage chỉ emit khi bài có FAQ nhập tay (khớp khối FAQ visible trong ArticleDetail).
    const faqJsonLd = buildFaqJsonLd(Array.isArray(article.faq) ? article.faq : []);
    schemas = [jsonLd, breadcrumbJsonLd, ...(faqJsonLd ? [faqJsonLd] : [])];
  } catch {
    schemas = [];
  }

  return (
    <>
      <JsonLdScripts schemas={schemas} />
      <NewsDetailClient article={article} />
    </>
  );
}
