import { createHash } from 'node:crypto';
import { publicCanonicalUrl } from '@/lib/siteUrl';
import { evaluateArticleIngestQuality, type ArticleIngestQualityResult } from '@/lib/articleIngestQuality';
import type { ArticleRow } from '@/lib/apiIngest';
import type { NewsArticle } from '@/lib/supabase';

export type NewsPublishBoundaryMode = 'observe' | 'enforce';

export type NewsPublicationQualityReport = ArticleIngestQualityResult & {
  quality_status: 'pass' | 'warning' | 'blocked';
  quality_version: string;
  content_version: number;
  canonical_url: string;
  evaluated_at: string;
  content_fingerprint: string;
};

export function newsPublishBoundaryMode(): NewsPublishBoundaryMode {
  return process.env.NEWS_PUBLISH_BOUNDARY_MODE === 'enforce' ? 'enforce' : 'observe';
}

function compact(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function toArticleRow(article: NewsArticle): ArticleRow {
  return {
    title: article.title,
    content: article.content ?? '',
    excerpt: article.excerpt,
    category: article.category,
    author: article.author,
    author_type: article.author_type ?? 'Organization',
    author_role: article.author_role ?? null,
    published_at: article.published_at ?? null,
    as_of_date: article.as_of_date ?? null,
    reviewer_name: article.reviewer_name ?? null,
    reviewer_role: article.reviewer_role ?? null,
    source_note: article.source_note ?? null,
    image_url: article.image_url,
    meta_title: article.meta_title,
    meta_description: article.meta_description,
    focus_keywords: article.focus_keywords,
    external_id: article.id,
    geo_area: article.geo_area ?? '',
    geo_entity: article.geo_entity ?? '',
    geo_notes: article.geo_notes ?? '',
    faq: article.faq ?? [],
    citations: article.citations ?? [],
    is_published: false,
  };
}

function contentFingerprint(article: NewsArticle) {
  return createHash('sha256').update(JSON.stringify({
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    image_url: article.image_url,
    category: article.category,
    author: article.author,
    author_type: article.author_type,
    author_role: article.author_role,
    as_of_date: article.as_of_date,
    reviewer_name: article.reviewer_name,
    reviewer_role: article.reviewer_role,
    source_note: article.source_note,
    meta_title: article.meta_title,
    meta_description: article.meta_description,
    focus_keywords: article.focus_keywords,
    geo_area: article.geo_area,
    geo_entity: article.geo_entity,
    geo_notes: article.geo_notes,
    faq: article.faq,
    citations: article.citations,
  })).digest('hex');
}

export function buildNewsPublicationQualityReport(article: NewsArticle): NewsPublicationQualityReport {
  const quality = evaluateArticleIngestQuality(toArticleRow(article), { rawContent: article.content ?? '' });
  const qualityStatus = quality.passed ? (quality.warnings.length ? 'warning' : 'pass') : 'blocked';
  const slug = compact(article.slug);
  return {
    ...quality,
    quality_status: qualityStatus,
    quality_version: quality.version,
    content_version: article.content_version ?? 0,
    canonical_url: publicCanonicalUrl(slug ? `/tin-tuc/${slug}` : '/tin-tuc'),
    evaluated_at: new Date().toISOString(),
    content_fingerprint: contentFingerprint(article),
  };
}

export function isPublishQualityAccepted(report: NewsPublicationQualityReport) {
  return report.passed;
}
