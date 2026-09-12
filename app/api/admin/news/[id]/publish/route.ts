import { NextRequest, NextResponse } from 'next/server';
import { adminClient, callerClient, requireOwner } from '@/lib/server/requireAdmin';
import {
  buildNewsPublicationQualityReport,
  isPublishQualityAccepted,
  newsPublishBoundaryMode,
} from '@/lib/server/newsPublishing';
import type { NewsArticle } from '@/lib/supabase';
import { propagatePublicIndexing } from '@/lib/server/publicIndexing';
import { isSafePublicSlugSegment } from '@/lib/slug';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PublicationResult = {
  id: string;
  slug: string;
  category: string;
  is_published: boolean;
  published_at: string | null;
  content_version: number;
  event_id: string | null;
  changed: boolean;
};

function parseBody(value: unknown): { publish: boolean; expectedContentVersion: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.publish !== 'boolean') return null;
  if (
    typeof body.expectedContentVersion !== 'number'
    || !Number.isSafeInteger(body.expectedContentVersion)
    || body.expectedContentVersion < 1
  ) return null;
  return { publish: body.publish, expectedContentVersion: body.expectedContentVersion };
}


function safeRequestId(): string {
  return crypto.randomUUID();
}

function publicationErrorMessage(code: string): string {
  if (code === 'STALE_VERSION') return 'Bài viết đã thay đổi, vui lòng tải lại.';
  if (code === 'NOT_ALLOWED') return 'Bạn không có quyền cập nhật trạng thái xuất bản bài viết này.';
  if (code === 'NOT_FOUND') return 'Không tìm thấy bài viết.';
  if (code === 'READ_FAILED') return 'Không đọc được bài viết từ máy chủ.';
  if (code === 'INVALID_RESULT') return 'Máy chủ không trả về kết quả xuất bản hợp lệ.';
  if (code === 'QUALITY_GATE') return 'Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.';
  return 'Không thể cập nhật trạng thái xuất bản.';
}

function serverFailureResponse(
  code: string,
  status: number,
  options?: { qualityGate?: ReturnType<typeof buildNewsPublicationQualityReport>; cause?: { code?: string; message?: string } },
) {
  const requestId = safeRequestId();
  const cause = options?.cause;
  console.error(`[news-publish:${requestId}]`, {
    code,
    causeCode: cause?.code,
    causeMessage: cause?.message,
  });
  const body: {
    error: string;
    code: string;
    request_id: string;
    quality_gate?: ReturnType<typeof buildNewsPublicationQualityReport>;
  } = {
    error: publicationErrorMessage(code),
    code,
    request_id: requestId,
  };
  if (code === 'QUALITY_GATE' && options?.qualityGate) body.quality_gate = options.qualityGate;
  return NextResponse.json(body, { status });
}

function errorCode(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code === '40001') return 'STALE_VERSION';
  if (error?.code === '42501') return 'NOT_ALLOWED';
  if (error?.code === '23514') return 'QUALITY_GATE';
  if (error?.code === 'P0002') return 'NOT_FOUND';
  return 'PUBLISH_FAILED';
}

async function affectedPaths(article: Pick<NewsArticle, 'slug' | 'category'>, token: string) {
  const paths = new Set(['/','/tin-tuc','/kien-thuc','/sitemap.xml','/sitemap-images.xml']);
  if (isSafePublicSlugSegment(article.slug)) paths.add(`/tin-tuc/${article.slug.trim()}`);
  const client = callerClient(token);
  const { data } = await client.from('news_categories').select('slug').eq('label', article.category).maybeSingle();
  if (data?.slug) paths.add(`/tin-tuc/danh-muc/${data.slug}`);
  return [...paths].sort();
}

async function observeLegacyPublish({
  client,
  article,
  publish,
  mode,
  report,
  paths,
  actorId,
}: {
  client: ReturnType<typeof callerClient>;
  article: NewsArticle;
  publish: boolean;
  mode: ReturnType<typeof newsPublishBoundaryMode>;
  report: ReturnType<typeof buildNewsPublicationQualityReport>;
  paths: string[];
  actorId: string;
}) {
  const previousPublished = Boolean(article.is_published);
  const nextPublishedAt = publish
    ? (article.published_at ?? new Date().toISOString())
    : article.published_at;
  if (previousPublished === publish) {
    return NextResponse.json({
      ok: true,
      mode,
      result: {
        id: article.id,
        slug: article.slug,
        category: article.category,
        is_published: previousPublished,
        published_at: article.published_at,
        content_version: article.content_version ?? 1,
        event_id: null,
        changed: false,
      },
      quality_gate: report,
      paths,
    });
  }

  const { data, error } = await client
    .from('news')
    .update({
      is_published: publish,
      published_at: nextPublishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article.id)
    .select('id,slug,category,is_published,published_at')
    .single();
  if (error || !data) {
    return serverFailureResponse('PUBLISH_FAILED', 503, { cause: error ?? undefined });
  }

  const updated = data as Pick<PublicationResult, 'id' | 'slug' | 'category' | 'is_published' | 'published_at'>;
  const result: PublicationResult = {
    id: updated.id,
    slug: updated.slug,
    category: updated.category,
    is_published: updated.is_published,
    published_at: updated.published_at,
    content_version: 1,
    event_id: null,
    changed: true,
  };
  const propagation = await propagatePublicIndexing({
    content: {
      entity: 'news',
      action: publish ? 'publish' : 'unpublish',
      targets: [{
        previous: {
          id: article.id,
          slug: article.slug,
          category: article.category,
          is_published: previousPublished,
        },
        current: {
          id: updated.id,
          slug: updated.slug,
          category: updated.category,
          is_published: updated.is_published,
        },
      }],
    },
    lookups: { areaSlugs: new Map(), categorySlugs: new Map() },
    actorId,
    paths,
  });
  return NextResponse.json({ ok: true, mode, result, quality_gate: report, ...propagation });
}

export async function POST(
  req: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg, code: 'NOT_ALLOWED' }, { status: auth.status });

  const id = context.params.id;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID bài viết không hợp lệ.', code: 'INVALID_ID' }, { status: 400 });
  const body = parseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'Payload xuất bản không hợp lệ.', code: 'INVALID_PAYLOAD' }, { status: 400 });

  const client = callerClient(auth.token);
  const { data: article, error: readError } = await client
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) return serverFailureResponse('READ_FAILED', 503, { cause: readError });
  if (!article) return NextResponse.json({ error: 'Không tìm thấy bài viết.', code: 'NOT_FOUND' }, { status: 404 });

  const typedArticle = article as NewsArticle;
  const mode = newsPublishBoundaryMode();
  const report = buildNewsPublicationQualityReport(typedArticle);
  if (body.publish && !isPublishQualityAccepted(report)) {
    return NextResponse.json(
      { error: 'Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.', code: 'QUALITY_GATE', quality_gate: report },
      { status: 422 },
    );
  }

  const hasContentVersion = Number.isSafeInteger(typedArticle.content_version) && (typedArticle.content_version ?? 0) >= 1;
  const paths = await affectedPaths({ slug: typedArticle.slug, category: typedArticle.category }, auth.token);

  if (!hasContentVersion) {
    if (mode === 'enforce') {
      return NextResponse.json({ error: 'Production chưa có migration News publication boundary.', code: 'MIGRATION_REQUIRED' }, { status: 503 });
    }
    return observeLegacyPublish({
      client,
      article: typedArticle,
      publish: body.publish,
      mode,
      report,
      paths,
      actorId: auth.userId,
    });
  }

  const boundaryClient = adminClient();
  if (!boundaryClient) {
    return NextResponse.json(
      { error: 'Server publication boundary chưa được cấu hình.', code: 'SERVER_BOUNDARY_UNAVAILABLE' },
      { status: 503 },
    );
  }

  const { data, error } = await boundaryClient.rpc('publish_news_article_server', {
    p_news_id: id,
    p_expected_content_version: body.expectedContentVersion,
    p_publish: body.publish,
    p_actor_id: auth.userId,
    p_quality_report: report,
    p_affected_paths: paths,
  });
  if (error) {
    const code = errorCode(error);
    const status = code === 'STALE_VERSION' ? 409 : code === 'NOT_ALLOWED' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'QUALITY_GATE' ? 422 : 503;
    return serverFailureResponse(code, status, {
      qualityGate: report,
      cause: error,
    });
  }

  const result = (Array.isArray(data) ? data[0] : data) as PublicationResult | null;
  if (!result) return serverFailureResponse('INVALID_RESULT', 503);
  if (!result.changed) return NextResponse.json({ ok: true, mode, result, quality_gate: report, paths });

  const propagation = await propagatePublicIndexing({
    content: {
      entity: 'news',
      action: body.publish ? 'publish' : 'unpublish',
      targets: [{
        current: {
          id: result.id,
          slug: result.slug,
          category: result.category,
          is_published: result.is_published,
        },
      }],
    },
    lookups: { areaSlugs: new Map(), categorySlugs: new Map() },
    actorId: auth.userId,
    paths,
    eventKey: result.event_id,
  });

  return NextResponse.json({ ok: true, mode, result, quality_gate: report, ...propagation });
}
