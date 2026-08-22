import { createHash } from 'crypto';
import { adminClient } from './requireAdmin';
import {
  buildSearchVisibilityCandidates,
  summarizeSearchVisibility,
  SEARCH_VISIBILITY_CANONICAL_ORIGIN,
  type SearchVisibilityCandidate,
  type SearchVisibilitySources,
} from './searchVisibility';

type QueryResult<T> = { data: T[] | null; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null };

type PersistenceError = { message: string; code?: string; details?: string | null; hint?: string | null };

export class SearchVisibilitySyncError extends Error {
  constructor(
    readonly code: 'CANONICAL_POLICY' | 'SOURCE_READ' | 'AUDIT_WRITE' | 'RUN_CREATE' | 'RUN_FINALIZE' | 'SERVER_CONFIG',
    message: string,
  ) {
    super(message);
    this.name = 'SearchVisibilitySyncError';
  }
}

type VisibilityQueryBuilder = {
  select: (columns: string) => Promise<QueryResult<Record<string, unknown>>>;
  upsert: (rows: Record<string, unknown>[], options: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
  insert: (row: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
    };
  };
  update: (row: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
};

export type VisibilityDatabase = {
  from: (table: string) => VisibilityQueryBuilder;
};

export const SEARCH_VISIBILITY_SOURCE_SELECTS = {
  properties: 'id,slug,public_code,listing_type,district,property_type_id,is_active,updated_at,neighborhood_slug,areas(slug)',
  // areas/neighborhoods only expose created_at in production. Do not add updated_at
  // unless the production schema has explicitly been extended and verified.
  areas: 'id,name,slug,description,created_at',
  neighborhoods: 'id,name,slug,description,created_at',
  news: 'id,slug,is_published,updated_at',
  newsCategories: 'id,slug,updated_at',
  managedPages: 'id,slug,is_active,is_system,updated_at',
} as const;

function sourceVersion(candidate: SearchVisibilityCandidate): string {
  return createHash('sha256')
    .update(JSON.stringify({
      sourceKey: candidate.sourceKey,
      canonicalPath: candidate.canonicalPath,
      eligible: candidate.eligible,
      reasonCode: candidate.reasonCode,
      reasonDetail: candidate.reasonDetail,
      contentUpdatedAt: candidate.contentUpdatedAt,
    }))
    .digest('hex');
}

function toRow(candidate: SearchVisibilityCandidate): Record<string, unknown> {
  return {
    source_key: candidate.sourceKey,
    entity_type: candidate.entityType,
    entity_id: candidate.entityId,
    canonical_url: candidate.canonicalUrl,
    canonical_path: candidate.canonicalPath,
    eligible: candidate.eligible,
    reason_code: candidate.reasonCode,
    reason_detail: candidate.reasonDetail,
    content_updated_at: candidate.contentUpdatedAt,
    evaluated_at: new Date().toISOString(),
    source_version: sourceVersion(candidate),
    updated_at: new Date().toISOString(),
  };
}

export function validateSearchVisibilityCandidates(candidates: SearchVisibilityCandidate[]): void {
  const invalid = candidates.filter(candidate => {
    const sourceKeyValid = /^[a-z_]+:[A-Za-z0-9:_-]{1,240}$/.test(candidate.sourceKey);
    const pathValid = candidate.canonicalPath === null || (/^\/[A-Za-z0-9/_-]*$/.test(candidate.canonicalPath) && !candidate.canonicalPath.includes('//'));
    const expectedUrl = candidate.canonicalPath ? `${SEARCH_VISIBILITY_CANONICAL_ORIGIN}${candidate.canonicalPath}` : null;
    const urlValid = candidate.canonicalUrl === expectedUrl;
    const shapeValid = candidate.eligible
      ? candidate.reasonCode === 'ELIGIBLE' && candidate.canonicalPath !== null && candidate.canonicalUrl !== null
      : candidate.reasonCode !== 'ELIGIBLE';
    return !sourceKeyValid || !pathValid || !urlValid || !shapeValid;
  });
  if (!invalid.length) return;

  const affected = invalid.slice(0, 5).map(candidate => candidate.sourceKey).join(', ');
  throw new SearchVisibilitySyncError(
    'CANONICAL_POLICY',
    `URL canonical không khớp chính sách audit (${invalid.length} mục: ${affected}). Đồng bộ đã dừng trước khi ghi dữ liệu.`,
  );
}

function auditWriteError(error: PersistenceError): SearchVisibilitySyncError {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  if (text.includes('search_visibility_url_absolute_canonical')) {
    return new SearchVisibilitySyncError('CANONICAL_POLICY', 'URL canonical không khớp domain https://chonhaviet.com. Đồng bộ đã bị chặn trước khi hoàn tất audit.');
  }
  if (text.includes('search_visibility_urls_canonical_url_unique')) {
    return new SearchVisibilitySyncError('AUDIT_WRITE', 'Có hai nguồn đang tạo cùng một URL canonical; cần kiểm tra dữ liệu slug trước khi lưu audit.');
  }
  return new SearchVisibilitySyncError('AUDIT_WRITE', 'Không lưu được audit URL. Kiểm tra dữ liệu registry hoặc cấu hình server rồi thử lại.');
}

async function readSources(client: VisibilityDatabase): Promise<SearchVisibilitySources> {
  const [properties, areas, neighborhoods, news, newsCategories, managedPages] = await Promise.all([
    client.from('properties').select(SEARCH_VISIBILITY_SOURCE_SELECTS.properties),
    client.from('areas').select(SEARCH_VISIBILITY_SOURCE_SELECTS.areas),
    client.from('neighborhoods').select(SEARCH_VISIBILITY_SOURCE_SELECTS.neighborhoods),
    client.from('news').select(SEARCH_VISIBILITY_SOURCE_SELECTS.news),
    client.from('news_categories').select(SEARCH_VISIBILITY_SOURCE_SELECTS.newsCategories),
    client.from('managed_pages').select(SEARCH_VISIBILITY_SOURCE_SELECTS.managedPages),
  ]);
  const results = [properties, areas, neighborhoods, news, newsCategories, managedPages];
  const error = results.find(result => result.error)?.error;
  if (error) throw new SearchVisibilitySyncError('SOURCE_READ', `Không tải được nguồn URL public: ${error.message}`);
  return {
    properties: (properties.data ?? []) as unknown as SearchVisibilitySources['properties'],
    areas: (areas.data ?? []) as unknown as SearchVisibilitySources['areas'],
    neighborhoods: (neighborhoods.data ?? []) as unknown as SearchVisibilitySources['neighborhoods'],
    news: (news.data ?? []) as unknown as SearchVisibilitySources['news'],
    newsCategories: (newsCategories.data ?? []) as unknown as SearchVisibilitySources['newsCategories'],
    managedPages: (managedPages.data ?? []) as unknown as SearchVisibilitySources['managedPages'],
  };
}

export interface SearchVisibilitySyncResult {
  runId: string;
  summary: ReturnType<typeof summarizeSearchVisibility>;
}

// Server-only sync. This deliberately has no Google API dependency: it stores only
// deterministic eligibility evidence from the same public-source policy as sitemap.
export async function syncSearchVisibilityAudit(actorId: string): Promise<SearchVisibilitySyncResult> {
  const client = adminClient() as unknown as VisibilityDatabase | null;
  if (!client) throw new SearchVisibilitySyncError('SERVER_CONFIG', 'Chưa cấu hình quyền server để đồng bộ audit URL.');

  const runResult = await client.from('search_visibility_runs').insert({
    run_type: 'eligibility_sync',
    actor_kind: 'owner',
    actor_id: actorId,
    status: 'running',
  }).select('id').single();
  if (runResult.error || !runResult.data) throw new SearchVisibilitySyncError('RUN_CREATE', 'Không khởi tạo được lượt đồng bộ audit URL.');

  try {
    const candidates = buildSearchVisibilityCandidates(await readSources(client));
    validateSearchVisibilityCandidates(candidates);
    const summary = summarizeSearchVisibility(candidates);
    const upsert = await client.from('search_visibility_urls').upsert(candidates.map(toRow), { onConflict: 'source_key' });
    if (upsert.error) throw auditWriteError(upsert.error);
    const finish = await client.from('search_visibility_runs').update({
      status: 'succeeded',
      requested_count: candidates.length,
      processed_count: candidates.length,
      succeeded_count: candidates.length,
      finished_at: new Date().toISOString(),
      metadata: { summary },
    }).eq('id', runResult.data.id);
    if (finish.error) throw new SearchVisibilitySyncError('RUN_FINALIZE', 'Đã lưu audit URL nhưng không hoàn tất được lượt đồng bộ.');
    return { runId: runResult.data.id, summary };
  } catch (error) {
    const primaryError = error instanceof Error ? error : new Error('Lỗi không xác định.');
    const failure = await client.from('search_visibility_runs').update({
      status: 'failed',
      error_summary: primaryError.message.slice(0, 500),
      finished_at: new Date().toISOString(),
    }).eq('id', runResult.data.id);
    if (failure.error) console.error('[search-visibility] không ghi được trạng thái failed:', failure.error.message);
    throw primaryError;
  }
}
