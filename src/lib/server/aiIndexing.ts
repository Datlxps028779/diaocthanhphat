import type { ContentRevalidationInput } from './contentRevalidation';
import { adminClient } from './requireAdmin';

export type AiIndexStatus = 'succeeded' | 'skipped' | 'degraded';

export const RAG_DEFERRED_MESSAGE = 'RAG đang tạm hoãn theo scope hiện tại.';

/**
 * RAG is deliberately opt-in. SEO, Search Visibility, freshness and the
 * live AIO path must remain usable while the projection is deferred.
 *
 * A server-only variable is preferred. The public-prefixed fallback keeps the
 * rollout easy to configure in the existing deployment setup, but this value
 * is only read by this server module and never authorizes a browser RPC call.
 */
export function isAiRagEnabled(): boolean {
  return process.env.AIO_RAG_MODE === 'enabled' || process.env.PUBLIC_AIO_RAG_MODE === 'enabled';
}

export type AiIndexPropagation = {
  status: AiIndexStatus;
  /** Primary source associated with the mutation; null means no single source. */
  target: string | null;
  /** All RAG sources refreshed for this mutation, including dependent sources. */
  targets: string[];
  indexedCount: number;
  error: string | null;
};

/**
 * The public AIO assistant reads from the SQL-built RAG projection. A source
 * mutation can also invalidate dependent chunks whose canonical URL, taxonomy
 * label, or grounding metadata changed.
 */
export function aiIndexTargetsForContent(input: ContentRevalidationInput): string[] {
  switch (input.entity) {
    case 'property':
      return ['properties'];
    case 'news':
      return ['news'];
    case 'area':
      return ['areas', 'properties', 'price_stats'];
    case 'neighborhood':
      return ['neighborhoods', 'properties', 'price_stats'];
    case 'route':
      return ['managed_pages'];
  }
}

export function aiIndexTargetForContent(input: ContentRevalidationInput): string | null {
  return aiIndexTargetsForContent(input)[0] ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function refreshAiIndex(input: {
  content: ContentRevalidationInput;
  shouldRefresh: boolean;
  skipReason?: string | null;
}): Promise<AiIndexPropagation> {
  const targets = aiIndexTargetsForContent(input.content);
  const target = targets[0] ?? null;
  if (!input.shouldRefresh || targets.length === 0) {
    return { status: 'skipped', target, targets, indexedCount: 0, error: input.skipReason ?? null };
  }

  if (!isAiRagEnabled()) {
    return {
      status: 'skipped',
      target,
      targets,
      indexedCount: 0,
      error: input.skipReason ?? RAG_DEFERRED_MESSAGE,
    };
  }

  const admin = adminClient();
  if (!admin || typeof (admin as { rpc?: unknown }).rpc !== 'function') {
    return {
      status: 'skipped',
      target,
      targets,
      indexedCount: 0,
      error: 'Chưa cấu hình quyền server để làm mới chỉ mục AIO.',
    };
  }

  const results = await Promise.all(targets.map(async source => {
    try {
      const { data, error } = await admin.rpc('refresh_rag_index', { target: source });
      if (error) throw error;
      return { source, count: typeof data === 'number' ? data : 0, error: null };
    } catch (error) {
      return { source, count: 0, error: errorMessage(error) };
    }
  }));
  const failures = results.filter(result => result.error);
  if (failures.length > 0) {
    const message = failures.map(result => `${result.source}: ${result.error}`).join('; ');
    console.error('[public-indexing] AIO index degraded:', message);
    return {
      status: 'degraded',
      target,
      targets,
      indexedCount: results.reduce((sum, result) => sum + result.count, 0),
      error: message,
    };
  }

  return {
    status: 'succeeded',
    target,
    targets,
    indexedCount: results.reduce((sum, result) => sum + result.count, 0),
    error: null,
  };
}
