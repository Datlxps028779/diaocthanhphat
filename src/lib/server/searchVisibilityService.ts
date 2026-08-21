import { createHash } from 'crypto';
import { adminClient } from './requireAdmin';
import {
  buildSearchVisibilityCandidates,
  summarizeSearchVisibility,
  type SearchVisibilityCandidate,
  type SearchVisibilitySources,
} from './searchVisibility';

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

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

type VisibilityDatabase = {
  from: (table: string) => VisibilityQueryBuilder;
};

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

async function readSources(client: VisibilityDatabase): Promise<SearchVisibilitySources> {
  const [properties, areas, neighborhoods, news, newsCategories, managedPages] = await Promise.all([
    client.from('properties').select('id,slug,public_code,listing_type,district,property_type_id,is_active,updated_at,neighborhood_slug,areas(slug)'),
    client.from('areas').select('id,name,slug,description,created_at,updated_at'),
    client.from('neighborhoods').select('id,name,slug,description,created_at,updated_at'),
    client.from('news').select('id,slug,is_published,updated_at'),
    client.from('news_categories').select('id,slug,updated_at'),
    client.from('managed_pages').select('id,slug,is_active,is_system,updated_at'),
  ]);
  const results = [properties, areas, neighborhoods, news, newsCategories, managedPages];
  const error = results.find(result => result.error)?.error;
  if (error) throw new Error(`Không tải được nguồn URL public: ${error.message}`);
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
  if (!client) throw new Error('Chưa cấu hình quyền server để đồng bộ audit URL.');

  const runResult = await client.from('search_visibility_runs').insert({
    run_type: 'eligibility_sync',
    actor_kind: 'owner',
    actor_id: actorId,
    status: 'running',
  }).select('id').single();
  if (runResult.error || !runResult.data) throw new Error('Không khởi tạo được lượt đồng bộ audit URL.');

  try {
    const candidates = buildSearchVisibilityCandidates(await readSources(client));
    const summary = summarizeSearchVisibility(candidates);
    const upsert = await client.from('search_visibility_urls').upsert(candidates.map(toRow), { onConflict: 'source_key' });
    if (upsert.error) throw new Error(`Không lưu được audit URL: ${upsert.error.message}`);
    const finish = await client.from('search_visibility_runs').update({
      status: 'succeeded',
      requested_count: candidates.length,
      processed_count: candidates.length,
      succeeded_count: candidates.length,
      finished_at: new Date().toISOString(),
      metadata: { summary },
    }).eq('id', runResult.data.id);
    if (finish.error) throw new Error(`Không hoàn tất được lượt audit URL: ${finish.error.message}`);
    return { runId: runResult.data.id, summary };
  } catch (error) {
    await client.from('search_visibility_runs').update({
      status: 'failed',
      error_summary: error instanceof Error ? error.message.slice(0, 500) : 'Lỗi không xác định.',
      finished_at: new Date().toISOString(),
    }).eq('id', runResult.data.id);
    throw error;
  }
}
