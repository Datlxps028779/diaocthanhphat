import { createHash } from 'crypto';
import { adminClient } from './requireAdmin';
import {
  getSearchConsoleConfig,
  inspectSearchConsoleUrl,
  submitSearchConsoleSitemap,
  type UrlInspectionEvidence,
  SearchConsoleError,
} from './googleSearchConsole';
import {
  buildSearchVisibilityCandidates,
  summarizeSearchVisibility,
  SEARCH_VISIBILITY_CANONICAL_ORIGIN,
  type SearchVisibilityCandidate,
  type SearchVisibilitySources,
} from './searchVisibility';

type PersistenceError = { message: string; code?: string; details?: string | null; hint?: string | null };

export class SearchVisibilitySyncError extends Error {
  constructor(
    readonly code: 'CANONICAL_POLICY' | 'CANONICAL_CONSTRAINT' | 'SOURCE_READ' | 'AUDIT_WRITE' | 'RUN_CREATE' | 'RUN_FINALIZE' | 'SERVER_CONFIG' | 'GOOGLE_NOT_CONFIGURED' | 'GOOGLE_CONFIG_INVALID' | 'GOOGLE_AUTH' | 'GOOGLE_REQUEST' | 'GOOGLE_RESPONSE' | 'GOOGLE_DEFERRED',
    message: string,
  ) {
    super(message);
    this.name = 'SearchVisibilitySyncError';
  }
}

export type VisibilityDatabase = {
  // Supabase query builders are thenable and expose a large fluent API. Keep this
  // boundary structural so service tests can supply a small in-memory double.
  from: (table: string) => any;
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

export function classifySearchVisibilityPersistenceError(error: PersistenceError): SearchVisibilitySyncError {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  if (text.includes('search_visibility_url_absolute_canonical')) {
    return new SearchVisibilitySyncError('CANONICAL_CONSTRAINT', 'Constraint canonical trong production chưa khớp chính sách https://chonhaviet.com. Cần chạy migration sửa constraint trước khi đồng bộ lại.');
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

export interface SearchVisibilityGoogleRunResult {
  runId: string;
  requestedCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
}

export const SEARCH_VISIBILITY_INSPECTION_BATCH_SIZE = 5;
export const SEARCH_VISIBILITY_SITEMAP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function searchConsoleSyncError(error: unknown): SearchVisibilitySyncError {
  if (error instanceof SearchVisibilitySyncError) return error;
  if (error instanceof SearchConsoleError) return new SearchVisibilitySyncError(error.code, error.message);
  return new SearchVisibilitySyncError('GOOGLE_REQUEST', 'Không hoàn tất được yêu cầu Google Search Console.');
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function eligibleCanonicalUrl(row: Record<string, unknown>): string | null {
  const value = row.canonical_url;
  if (row.eligible !== true || typeof value !== 'string') return null;
  if (!/^https:\/\/chonhaviet\.com\/[A-Za-z0-9/_-]*$/.test(value)) return null;
  return value;
}

async function createGoogleRun(client: VisibilityDatabase, actorId: string, runType: 'sitemap_submit' | 'inspection_batch', requestedCount = 0, requestFingerprint?: string): Promise<string> {
  const result = await client.from('search_visibility_runs').insert({
    run_type: runType,
    actor_kind: 'owner',
    actor_id: actorId,
    requested_count: requestedCount,
    request_fingerprint: requestFingerprint ?? null,
    status: 'running',
  }).select('id').single();
  if (result.error || !result.data) throw new SearchVisibilitySyncError('RUN_CREATE', 'Không khởi tạo được lượt thao tác Search Console.');
  return result.data.id;
}

async function finishGoogleRun(client: VisibilityDatabase, runId: string, values: Record<string, unknown>): Promise<void> {
  const result = await client.from('search_visibility_runs').update({
    ...values,
    finished_at: new Date().toISOString(),
  }).eq('id', runId);
  if (result.error) throw new SearchVisibilitySyncError('RUN_FINALIZE', 'Đã nhận phản hồi Search Console nhưng không hoàn tất được audit run.');
}

export function isFutureTimestamp(value: unknown, now = Date.now()): boolean {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

export function isWithinSitemapCooldown(row: Record<string, unknown>, requestFingerprint: string, now = Date.now()): boolean {
  if (row.status !== 'succeeded' || row.request_fingerprint !== requestFingerprint) return false;
  if (typeof row.finished_at !== 'string') return false;
  const finishedAt = Date.parse(row.finished_at);
  return Number.isFinite(finishedAt) && now - finishedAt < SEARCH_VISIBILITY_SITEMAP_COOLDOWN_MS;
}

export async function submitSearchVisibilitySitemap(actorId: string): Promise<SearchVisibilityGoogleRunResult> {
  const config = getSearchConsoleConfig();
  if (!config) throw new SearchVisibilitySyncError('GOOGLE_NOT_CONFIGURED', 'Chưa cấu hình Search Console trên server. Owner cần thiết lập service account và secrets tại môi trường deploy.');
  const client = adminClient() as unknown as VisibilityDatabase | null;
  if (!client) throw new SearchVisibilitySyncError('SERVER_CONFIG', 'Chưa cấu hình quyền server để lưu kết quả Search Console.');

  const requestFingerprint = fingerprint(`${config.siteUrl}|${config.sitemapUrl}`);
  const latestRuns = await client.from('search_visibility_runs')
    .select('status,request_fingerprint,finished_at')
    .eq('run_type', 'sitemap_submit')
    .order('started_at', { ascending: false })
    .limit(12);
  if (latestRuns.error) throw new SearchVisibilitySyncError('SOURCE_READ', 'Không đọc được lịch sử sitemap submission để áp dụng cooldown an toàn.');
  const prior = (latestRuns.data ?? []).find((row: Record<string, unknown>) => isWithinSitemapCooldown(row, requestFingerprint));
  if (prior) {
    const nextAt = new Date(Date.parse(prior.finished_at as string) + SEARCH_VISIBILITY_SITEMAP_COOLDOWN_MS).toISOString();
    throw new SearchVisibilitySyncError('GOOGLE_DEFERRED', `Sitemap canonical đã gửi gần đây; có thể gửi lại sau ${new Date(nextAt).toLocaleString('vi-VN')}. Không gọi lại Google để tránh thao tác dư thừa.`);
  }
  const runId = await createGoogleRun(client, actorId, 'sitemap_submit', 1, requestFingerprint);
  try {
    await submitSearchConsoleSitemap(config);
    const timestamp = new Date().toISOString();
    const existing = await client.from('search_visibility_urls')
      .select('source_key,eligible,canonical_url')
      .eq('eligible', true)
      .order('source_key', { ascending: true })
      .limit(500);
    if (existing.error) throw new SearchVisibilitySyncError('SOURCE_READ', 'Google đã nhận sitemap nhưng không đọc được registry để lưu trạng thái audit.');
    const rows = (existing.data ?? []).filter((row: Record<string, unknown>) => eligibleCanonicalUrl(row));
    const update = rows.length ? await client.from('search_visibility_urls').upsert(rows.map((row: Record<string, unknown>) => ({
      ...row,
      sitemap_status: 'submitted',
      last_sitemap_submission_at: timestamp,
      sitemap_submission_fingerprint: requestFingerprint,
      sitemap_error: null,
      updated_at: timestamp,
    })), { onConflict: 'source_key' }) : { error: null };
    if (update.error) throw new SearchVisibilitySyncError('AUDIT_WRITE', 'Google đã nhận sitemap nhưng không lưu được trạng thái audit nội bộ.');
    await finishGoogleRun(client, runId, {
      status: 'succeeded', processed_count: 1, succeeded_count: 1,
      metadata: { siteUrl: config.siteUrl, sitemapUrl: config.sitemapUrl, submission: 'accepted_by_api_not_indexing_guarantee' },
    });
    return { runId, requestedCount: 1, processedCount: 1, succeededCount: 1, failedCount: 0 };
  } catch (error) {
    const normalized = searchConsoleSyncError(error);
    await client.from('search_visibility_runs').update({ status: 'failed', failed_count: 1, error_summary: normalized.message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', runId);
    throw normalized;
  }
}

function inspectionUpdate(evidence: UrlInspectionEvidence): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    inspection_status: 'inspected',
    last_inspected_at: now,
    next_inspection_at: null,
    inspection_error: null,
    google_verdict: evidence.verdict,
    google_coverage_state: evidence.coverageState,
    google_canonical: evidence.googleCanonical,
    user_canonical: evidence.userCanonical,
    google_robots_state: evidence.robotsState,
    google_last_crawl_at: evidence.lastCrawlAt,
    inspection_evidence: evidence.raw,
    evidence_observed_at: now,
    updated_at: now,
  };
}

export async function inspectSearchVisibilityBatch(actorId: string): Promise<SearchVisibilityGoogleRunResult> {
  const config = getSearchConsoleConfig();
  if (!config) throw new SearchVisibilitySyncError('GOOGLE_NOT_CONFIGURED', 'Chưa cấu hình Search Console trên server. Owner cần thiết lập service account và secrets tại môi trường deploy.');
  const client = adminClient() as unknown as VisibilityDatabase | null;
  if (!client) throw new SearchVisibilitySyncError('SERVER_CONFIG', 'Chưa cấu hình quyền server để lưu evidence Search Console.');

  const selected = await client.from('search_visibility_urls')
    .select('source_key,canonical_url,eligible,inspection_priority,next_inspection_at,last_inspected_at,inspection_attempt_count')
    .eq('eligible', true)
    .order('inspection_priority', { ascending: false })
    .order('last_inspected_at', { ascending: true, nullsFirst: true })
    .order('source_key', { ascending: true })
    // Read a bounded candidate window, then defensively skip deferred rows in server
    // code. This prevents a retry-deferred URL from consuming a manual batch slot.
    .limit(100);
  if (selected.error) throw new SearchVisibilitySyncError('SOURCE_READ', 'Không tải được registry URL eligible để kiểm tra Search Console.');
  const rows = (selected.data ?? [])
    .filter((row: Record<string, unknown>) => eligibleCanonicalUrl(row) && !isFutureTimestamp(row.next_inspection_at))
    .slice(0, SEARCH_VISIBILITY_INSPECTION_BATCH_SIZE);
  const runId = await createGoogleRun(client, actorId, 'inspection_batch', rows.length);
  let succeeded = 0;
  let failed = 0;

  try {
    for (const row of rows) {
      const canonicalUrl = eligibleCanonicalUrl(row)!;
      try {
        const evidence = await inspectSearchConsoleUrl(config, canonicalUrl);
        const update = await client.from('search_visibility_urls').update({
          ...inspectionUpdate(evidence),
          inspection_attempt_count: Number(row.inspection_attempt_count ?? 0) + 1,
        }).eq('source_key', row.source_key);
        if (update.error) throw new SearchVisibilitySyncError('AUDIT_WRITE', 'Không lưu được URL Inspection evidence.');
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const normalized = searchConsoleSyncError(error);
        await client.from('search_visibility_urls').update({
          inspection_status: 'error',
          inspection_attempt_count: Number(row.inspection_attempt_count ?? 0) + 1,
          inspection_error: normalized.message.slice(0, 500),
          next_inspection_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('source_key', row.source_key);
      }
    }
    const status = failed ? (succeeded ? 'partial' : 'failed') : 'succeeded';
    await finishGoogleRun(client, runId, {
      status, processed_count: rows.length, succeeded_count: succeeded, failed_count: failed,
      metadata: { batchLimit: SEARCH_VISIBILITY_INSPECTION_BATCH_SIZE, siteUrl: config.siteUrl, evidenceMeans: 'google_indexed_version_not_live_url_test' },
    });
    return { runId, requestedCount: rows.length, processedCount: rows.length, succeededCount: succeeded, failedCount: failed };
  } catch (error) {
    const normalized = error instanceof SearchVisibilitySyncError ? error : searchConsoleSyncError(error);
    await client.from('search_visibility_runs').update({ status: 'failed', processed_count: succeeded + failed, succeeded_count: succeeded, failed_count: failed, error_summary: normalized.message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', runId);
    throw normalized;
  }
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
    if (upsert.error) throw classifySearchVisibilityPersistenceError(upsert.error);
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
