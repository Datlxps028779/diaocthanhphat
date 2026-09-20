import { createHash } from 'crypto';
import { adminClient } from './requireAdmin';
import {
  diagnoseSearchConsoleAccess,
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
import type { LocalitySnapshot } from './localitySnapshot';
import { readCompleteAuditRows, readRegistryVersion } from './searchVisibilityRegistry';

const LOCALITY_SNAPSHOT_UNAVAILABLE_MESSAGE = 'Locality snapshot unavailable';

// Nạp loader snapshot địa phương bằng import ĐỘNG: bản thân module snapshot gọi
// reactCache()/unstable_cache() ở cấp module, nên import tĩnh sẽ kéo React + next/cache
// vào mọi lần import service (và vỡ test double tối giản). Import động giữ service nhẹ
// và vẫn dùng đúng loader thật khi chạy.
async function loadLocalitySnapshotForAudit(): Promise<LocalitySnapshot> {
  const { loadLocalitySnapshot } = await import('./localitySnapshot');
  return loadLocalitySnapshot();
}

type PersistenceError = { message: string; code?: string; details?: string | null; hint?: string | null };

export class SearchVisibilitySyncError extends Error {
  constructor(
    readonly code: 'RECONCILE_REQUIRED' | 'STALE_SNAPSHOT' | 'SUPERSEDED' | 'CANONICAL_POLICY' | 'CANONICAL_CONSTRAINT' | 'SOURCE_READ' | 'AUDIT_WRITE' | 'RUN_CREATE' | 'RUN_FINALIZE' | 'SERVER_CONFIG' | 'GOOGLE_NOT_CONFIGURED' | 'GOOGLE_CONFIG_INVALID' | 'GOOGLE_AUTH' | 'GOOGLE_REQUEST' | 'GOOGLE_RESPONSE' | 'GOOGLE_DEFERRED',
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
  rpc?: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: PersistenceError | null }>;
};

export const SEARCH_VISIBILITY_SOURCE_SELECTS = {
  properties: 'id,slug,public_code,listing_type,area_id,district_id,district,property_type_id,title,is_active,updated_at,neighborhood_slug,areas(slug)',
  // areas/neighborhoods only expose created_at in production. Do not add updated_at
  // unless the production schema has explicitly been extended and verified.
  areas: 'id,name,slug,description,created_at',
  districts: 'id,area_id,name,slug',
  propertyTypes: 'id,name,slug',
  neighborhoods: 'id,name,slug,description,created_at',
  news: 'id,slug,is_published,area_id,geo_area,updated_at',
  newsCategories: 'id,slug,updated_at',
  managedPages: 'id,slug,is_active,is_system,updated_at',
} as const;

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
  };
}

export function findCanonicalConflicts(
  candidates: SearchVisibilityCandidate[],
  existingRows: Array<{ source_key: string; canonical_url: string | null }>,
): Array<{ canonicalUrl: string; sourceKeys: string[] }> {
  const sourceKeysByUrl = new Map<string, Set<string>>();
  const add = (canonicalUrl: string, sourceKey: string) => {
    const sourceKeys = sourceKeysByUrl.get(canonicalUrl) ?? new Set<string>();
    sourceKeys.add(sourceKey);
    sourceKeysByUrl.set(canonicalUrl, sourceKeys);
  };

  for (const row of existingRows) {
    if (row.canonical_url) add(row.canonical_url, row.source_key);
  }
  const existingCanonicalBySourceKey = new Map(
    existingRows.map(row => [row.source_key, row.canonical_url]),
  );
  for (const candidate of candidates) {
    if (!candidate.canonicalUrl) continue;
    if (existingCanonicalBySourceKey.get(candidate.sourceKey) === candidate.canonicalUrl) continue;
    add(candidate.canonicalUrl, candidate.sourceKey);
  }

  return [...sourceKeysByUrl.entries()]
    .filter(([, sourceKeys]) => sourceKeys.size > 1)
    .map(([canonicalUrl, sourceKeys]) => ({ canonicalUrl, sourceKeys: [...sourceKeys].sort() }));
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
  if (error.code === 'PGRST202' || error.code === '42883') return new SearchVisibilitySyncError('RECONCILE_REQUIRED', 'Chưa có RPC reconcile registry. Cần áp migration trước khi đồng bộ; không dùng đường ghi cũ.');
  if (text.includes('SV_RECONCILE_SUPERSEDED')) return new SearchVisibilitySyncError('SUPERSEDED', 'Lượt đồng bộ đã được thay thế bởi lượt mới hơn. Không ghi registry.');
  if (text.includes('SV_RECONCILE_STALE_REGISTRY') || error.code === '40001') return new SearchVisibilitySyncError('STALE_SNAPSHOT', 'Snapshot registry đã thay đổi. Cần chạy lượt đồng bộ mới và đọc lại toàn bộ nguồn.');
  if (text.includes('SV_RECONCILE_CANONICAL_CONFLICT')) return new SearchVisibilitySyncError('CANONICAL_POLICY', 'Có nhiều nguồn giữ cùng URL canonical. Lượt đồng bộ đã rollback, cần kiểm tra nguồn.');
  if (text.includes('search_visibility_url_absolute_canonical')) {
    return new SearchVisibilitySyncError('CANONICAL_CONSTRAINT', 'Constraint canonical trong production chưa khớp chính sách https://chonhaviet.com. Cần chạy migration sửa constraint trước khi đồng bộ lại.');
  }
  if (text.includes('search_visibility_urls_canonical_url_unique')) {
    return new SearchVisibilitySyncError('AUDIT_WRITE', 'Có hai nguồn đang tạo cùng một URL canonical; cần kiểm tra dữ liệu slug trước khi lưu audit.');
  }
  return new SearchVisibilitySyncError('AUDIT_WRITE', 'Không lưu được audit URL. Kiểm tra dữ liệu registry hoặc cấu hình server rồi thử lại.');
}

type SourceQueryResult = { data: unknown[] | null; error: { message?: string } | null };

async function readAllSourceRows(client: VisibilityDatabase, table: string, select: string): Promise<SourceQueryResult> {
  try {
    return { data: await readCompleteAuditRows(client, table, select), error: null };
  } catch {
    return { data: null, error: { message: `Nguồn ${table} chưa đọc đầy đủ.` } };
  }
}

async function readSources(client: VisibilityDatabase): Promise<SearchVisibilitySources> {
  const [properties, areas, districts, propertyTypes, neighborhoods, news, newsCategories, managedPages] = await Promise.all([
    readAllSourceRows(client, 'properties', SEARCH_VISIBILITY_SOURCE_SELECTS.properties),
    readAllSourceRows(client, 'areas', SEARCH_VISIBILITY_SOURCE_SELECTS.areas),
    readAllSourceRows(client, 'districts', SEARCH_VISIBILITY_SOURCE_SELECTS.districts),
    readAllSourceRows(client, 'property_types', SEARCH_VISIBILITY_SOURCE_SELECTS.propertyTypes),
    readAllSourceRows(client, 'neighborhoods', SEARCH_VISIBILITY_SOURCE_SELECTS.neighborhoods),
    readAllSourceRows(client, 'news', SEARCH_VISIBILITY_SOURCE_SELECTS.news),
    readAllSourceRows(client, 'news_categories', SEARCH_VISIBILITY_SOURCE_SELECTS.newsCategories),
    readAllSourceRows(client, 'managed_pages', SEARCH_VISIBILITY_SOURCE_SELECTS.managedPages),
  ]);
  const results = [properties, areas, districts, propertyTypes, neighborhoods, news, newsCategories, managedPages];
  const error = results.find(result => result.error)?.error;
  if (error) throw new SearchVisibilitySyncError('SOURCE_READ', `Không tải được nguồn URL public: ${error.message}`);

  // Snapshot địa phương public HOÀN CHỈNH cho họ landing/report. Đọc bằng anon/public
  // (loadLocalitySnapshot tự tạo client public), KHÔNG dùng admin client cho dữ liệu
  // công khai. Snapshot thiếu/lỗi → ném lỗi rõ ràng và DỪNG lượt đồng bộ: không được
  // âm thầm bỏ họ locality (báo audit 0 mục như thể đã kiểm tra) cũng không fallback
  // sang mẫu thống kê bị cắt.
  let locality: SearchVisibilitySources['locality'];
  let localityNews: SearchVisibilitySources['localityNews'];
  try {
    const { loadLocalityNewsSnapshot } = await import('./localityNewsSnapshot');
    [locality, localityNews] = await Promise.all([loadLocalitySnapshotForAudit(), loadLocalityNewsSnapshot()]);
  } catch (localityError) {
    const detail = localityError instanceof Error ? localityError.message : LOCALITY_SNAPSHOT_UNAVAILABLE_MESSAGE;
    throw new SearchVisibilitySyncError(
      'SOURCE_READ',
      `Không tải được snapshot địa phương public nên không thể kiểm tra họ landing/report: ${detail}`,
    );
  }

  const sources: SearchVisibilitySources = {
    properties: (properties.data ?? []) as unknown as SearchVisibilitySources['properties'],
    areas: (areas.data ?? []) as unknown as SearchVisibilitySources['areas'],
    districts: (districts.data ?? []) as unknown as NonNullable<SearchVisibilitySources['districts']>,
    propertyTypes: (propertyTypes.data ?? []) as unknown as NonNullable<SearchVisibilitySources['propertyTypes']>,
    neighborhoods: (neighborhoods.data ?? []) as unknown as SearchVisibilitySources['neighborhoods'],
    news: (news.data ?? []) as unknown as SearchVisibilitySources['news'],
    newsCategories: (newsCategories.data ?? []) as unknown as SearchVisibilitySources['newsCategories'],
    managedPages: (managedPages.data ?? []) as unknown as SearchVisibilitySources['managedPages'],
    locality,
    localityNews,
    localityNewsAvailable: true,
  };

  return sources;
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

export async function diagnoseSearchVisibilityAccess() {
  const config = getSearchConsoleConfig();
  if (!config) throw new SearchVisibilitySyncError('GOOGLE_NOT_CONFIGURED', 'Chưa cấu hình Search Console trên server. Owner cần thiết lập service account và secrets tại môi trường deploy.');
  try {
    return await diagnoseSearchConsoleAccess(config);
  } catch (error) {
    throw searchConsoleSyncError(error);
  }
}

export const SEARCH_VISIBILITY_INSPECTION_BATCH_SIZE = 5;
export const SEARCH_VISIBILITY_SITEMAP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const GOOGLE_ACCEPTED_AUDIT_FAILURE_PREFIX = 'Google đã nhận sitemap nhưng không lưu được trạng thái audit nội bộ.';

export async function markEligibleUrlsSitemapSubmitted(
  client: VisibilityDatabase,
  requestFingerprint: string,
  timestamp = new Date().toISOString(),
): Promise<void> {
  // Do not upsert a partial row here. PostgreSQL checks required columns before
  // ON CONFLICT resolution, so an upsert containing only sitemap fields can fail
  // even for an existing source_key. Eligibility sync owns registry row creation.
  const update = await client.from('search_visibility_urls').update({
    sitemap_status: 'submitted',
    last_sitemap_submission_at: timestamp,
    sitemap_submission_fingerprint: requestFingerprint,
    sitemap_error: null,
    updated_at: timestamp,
  }).eq('eligible', true);
  if (update.error) {
    throw new SearchVisibilitySyncError('AUDIT_WRITE', GOOGLE_ACCEPTED_AUDIT_FAILURE_PREFIX);
  }
}

export function isRecoverableSitemapAuditFailure(row: Record<string, unknown>, requestFingerprint: string): boolean {
  return row.status === 'failed'
    && row.request_fingerprint === requestFingerprint
    && typeof row.error_summary === 'string'
    && row.error_summary.startsWith(GOOGLE_ACCEPTED_AUDIT_FAILURE_PREFIX);
}

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
    .select('id,status,request_fingerprint,finished_at,error_summary')
    .eq('run_type', 'sitemap_submit')
    .order('started_at', { ascending: false })
    .limit(12);
  if (latestRuns.error) throw new SearchVisibilitySyncError('SOURCE_READ', 'Không đọc được lịch sử sitemap submission để áp dụng cooldown an toàn.');
  const prior = (latestRuns.data ?? []).find((row: Record<string, unknown>) => isWithinSitemapCooldown(row, requestFingerprint));
  if (prior) {
    const nextAt = new Date(Date.parse(prior.finished_at as string) + SEARCH_VISIBILITY_SITEMAP_COOLDOWN_MS).toISOString();
    throw new SearchVisibilitySyncError('GOOGLE_DEFERRED', `Sitemap canonical đã gửi gần đây; có thể gửi lại sau ${new Date(nextAt).toLocaleString('vi-VN')}. Không gọi lại Google để tránh thao tác dư thừa.`);
  }
  const recoverable = (latestRuns.data ?? []).find((row: Record<string, unknown>) => isRecoverableSitemapAuditFailure(row, requestFingerprint));
  if (recoverable && typeof recoverable.id === 'string') {
    const timestamp = new Date().toISOString();
    await markEligibleUrlsSitemapSubmitted(client, requestFingerprint, timestamp);
    const reconcile = await client.from('search_visibility_runs').update({
      status: 'succeeded', processed_count: 1, succeeded_count: 1, failed_count: 0,
      error_summary: null, finished_at: timestamp,
      metadata: { siteUrl: config.siteUrl, sitemapUrl: config.sitemapUrl, submission: 'accepted_by_api_reconciled_without_repeat_google_call' },
    }).eq('id', recoverable.id);
    if (reconcile.error) throw new SearchVisibilitySyncError('RUN_FINALIZE', 'Đã khôi phục trạng thái sitemap nội bộ nhưng không hoàn tất được audit run.');
    return { runId: recoverable.id, requestedCount: 1, processedCount: 1, succeededCount: 1, failedCount: 0 };
  }
  const runId = await createGoogleRun(client, actorId, 'sitemap_submit', 1, requestFingerprint);
  try {
    await submitSearchConsoleSitemap(config);
    const timestamp = new Date().toISOString();
    await markEligibleUrlsSitemapSubmitted(client, requestFingerprint, timestamp);
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
export async function syncSearchVisibilityAudit(actorId: string | null): Promise<SearchVisibilitySyncResult> {
  const client = adminClient() as unknown as VisibilityDatabase | null;
  if (!client) throw new SearchVisibilitySyncError('SERVER_CONFIG', 'Chưa cấu hình quyền server để đồng bộ audit URL.');

  const runResult = await client.from('search_visibility_runs').insert({
    run_type: 'eligibility_sync',
    actor_kind: actorId ? 'owner' : 'system',
    actor_id: actorId,
    status: 'running',
  }).select('id').single();
  if (runResult.error || !runResult.data) throw new SearchVisibilitySyncError('RUN_CREATE', 'Không khởi tạo được lượt đồng bộ audit URL.');

  try {
    const sources = await readSources(client);
    const debugSourceCounts = {
      properties: sources.properties.length,
      areas: sources.areas.length,
      districts: sources.districts?.length ?? 0,
      propertyTypes: sources.propertyTypes?.length ?? 0,
      neighborhoods: sources.neighborhoods.length,
      news: sources.news.length,
      newsCategories: sources.newsCategories.length,
      managedPages: sources.managedPages.length,
      localityRows: sources.locality?.rows.length ?? 0,
    };

    const candidates = buildSearchVisibilityCandidates(sources);
    validateSearchVisibilityCandidates(candidates);
    const summary = summarizeSearchVisibility(candidates);
    let registry: Awaited<ReturnType<typeof readRegistryVersion>>;
    try { registry = await readRegistryVersion(client); }
    catch { throw new SearchVisibilitySyncError('SOURCE_READ', 'Không đọc được snapshot registry đầy đủ; không reconcile hoặc retire.'); }
    if (!client.rpc) throw new SearchVisibilitySyncError('RECONCILE_REQUIRED', 'Chưa có RPC reconcile registry; không dùng đường ghi cũ.');
    const rows = candidates.map(toRow);
    const snapshotFingerprint = fingerprint(JSON.stringify({ candidates: rows, registry }));
    const reconcile = await client.rpc('reconcile_search_visibility_snapshot', {
      p_run_id: runResult.data.id,
      p_candidates: rows,
      p_registry: registry,
      p_snapshot_fingerprint: snapshotFingerprint,
      p_summary: { summary, debugSourceCounts },
    });
    if (reconcile.error) throw classifySearchVisibilityPersistenceError(reconcile.error);
    const result = reconcile.data as { runId?: unknown; status?: unknown; candidateCount?: unknown } | null;
    if (!result || result.runId !== runResult.data.id || result.status !== 'succeeded' || result.candidateCount !== rows.length) {
      throw new SearchVisibilitySyncError('RUN_FINALIZE', 'Phản hồi reconcile không hợp lệ. Cần kiểm tra audit run trước khi chạy lại.');
    }
    return { runId: runResult.data.id, summary };
  } catch (error) {
    const primaryError = error instanceof Error ? error : new Error('Lỗi không xác định.');
    const failure = await client.from('search_visibility_runs').update({
      status: 'failed',
      error_summary: primaryError.message.slice(0, 500),
      finished_at: new Date().toISOString(),
    }).eq('id', runResult.data.id).eq('status', 'running');
    if (failure.error) console.error('[search-visibility] không ghi được trạng thái failed');
    throw primaryError;
  }
}
