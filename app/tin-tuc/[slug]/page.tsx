import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { serverGetNewsByIdOrSlug, serverGetNewsContextualProperties, serverGetRelatedNews, serverGetSiteSettings, serverGetMostViewedNews, serverGetNews } from '@/lib/supabase-server';
import { buildNewsMetadata, buildArticleJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { buildFaqJsonLd } from '@/lib/propertyFaq';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { NewsDetailClient } from './NewsDetailClient';
import { buildNewsPath } from '@/lib/newsPath';

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = await serverGetNewsByIdOrSlug(decodeURIComponent(params.slug));
  if (!article || !buildNewsPath(article)) return { title: 'Không tìm thấy bài viết', robots: { index: false, follow: false } };
  return buildNewsMetadata(article);
}

export default async function NewsArticlePage({ params }: Params) {
  const article = await serverGetNewsByIdOrSlug(decodeURIComponent(params.slug));
  if (!article) notFound();
  const canonicalPath = buildNewsPath(article);
  if (!canonicalPath) notFound();
  if (decodeURIComponent(params.slug) !== article.slug) redirect(canonicalPath);

  const [settings, related, mostViewed, latest, contextualProperties] = await Promise.all([
    serverGetSiteSettings(),
    serverGetRelatedNews(article, 8),
    serverGetMostViewedNews(12),
    serverGetNews(16),
    serverGetNewsContextualProperties(article),
  ]);
  // JSON-LD chỉ để SEO — dữ liệu jsonb (faq/citations) lỡ sai kiểu KHÔNG được làm sập
  // trang bài viết. Bọc try/catch: hỏng schema thì bỏ qua, trang vẫn render.
  let schemas: Record<string, unknown>[] = [];
  try {
    const jsonLd = buildArticleJsonLd(article, settings);
    const breadcrumbJsonLd = buildBreadcrumbJsonLd([
      { name: 'Trang chủ', path: '/' },
      { name: 'Tin tức', path: '/tin-tuc' },
      { name: article.title, path: canonicalPath },
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
      <NewsDetailClient
        article={article}
        related={related}
        mostViewed={mostViewed}
        latest={latest}
        contextualProperties={contextualProperties.properties}
        contextualLocationLabel={contextualProperties.locationLabel}
      />
    </>
  );
}
