import { createHash } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { adminClient } from './requireAdmin';
import {
  collectContentRevalidationPaths,
  type ContentRevalidationInput,
  type RevalidationLookups,
} from './contentRevalidation';
import {
  syncSearchVisibilityAudit,
  type SearchVisibilitySyncResult,
} from './searchVisibilityService';

// Tag snapshot địa phương KHÔNG nhận input từ client. Giữ literal ở đây (module thuần,
// không kéo React/next-cache của loader) và có test chốt khớp với
// localitySnapshot.LOCALITY_SNAPSHOT_CACHE_TAG. Một tag bao phủ mọi landing/report/
// ward/price phái sinh nên không cần liệt kê từng URL.
export const LOCALITY_SNAPSHOT_TAG = 'public-locality-snapshot';

// Snapshot tin tức khu vực (src/lib/server/localityNewsSnapshot.ts) giữ nguyên giá trị
// literal này. Chỉ purge khi có bài viết công khai thay đổi — khu vực/sản phẩm không
// đụng tới nó.
export const LOCALITY_NEWS_SNAPSHOT_TAG = 'public-locality-news-snapshot';

type PropagationLayerStatus = 'succeeded' | 'skipped' | 'degraded';

export type PublicIndexingPropagation = {
  paths: string[];
  freshness: {
    status: PropagationLayerStatus;
    queuedCount: number;
    error: string | null;
  };
  searchVisibility: {
    status: PropagationLayerStatus;
    runId: string | null;
    summary: SearchVisibilitySyncResult['summary'] | null;
    error: string | null;
  };
};

function publicImpact(input: ContentRevalidationInput): boolean {
  if (input.entity === 'news') {
    return input.targets.some(target => Boolean(target.current?.is_published || target.previous?.is_published));
  }
  if (input.entity === 'property') {
    return input.targets.some(target => Boolean(target.current?.is_active || target.previous?.is_active));
  }
  return input.entity === 'area' || input.entity === 'neighborhood';
}

async function queueFreshness(input: ContentRevalidationInput, paths: string[], eventKey?: string | null): Promise<number | null> {
  const admin = adminClient();
  if (!admin) return null;
  if (paths.length === 0) return 0;
  const fingerprint = createHash('sha256').update(JSON.stringify({ input, eventKey })).digest('hex');
  const rows = paths.map(path => ({
    dedupe_key: `${fingerprint}:${path}`.slice(0, 320),
    event_kind: input.entity,
    event_action: input.action,
    path,
  }));
  const { error } = await admin.from('seo_freshness_jobs').upsert(rows, {
    onConflict: 'dedupe_key',
    ignoreDuplicates: true,
  });
  if (error) throw error;
  return rows.length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Single server-side contract for public Product/News propagation.
 * This never calls Google. Search Console submission/inspection remains a
 * separate owner action and its evidence must not be inferred here.
 */
export async function propagatePublicIndexing(input: {
  content: ContentRevalidationInput;
  lookups: RevalidationLookups;
  actorId: string;
  paths?: string[];
  eventKey?: string | null;
}): Promise<PublicIndexingPropagation> {
  const paths = input.paths ?? collectContentRevalidationPaths(input.content, input.lookups);
  for (const path of paths) revalidatePath(path);

  if ((input.content.entity === 'area' || input.content.entity === 'property') && publicImpact(input.content)) {
    revalidateTag(LOCALITY_SNAPSHOT_TAG);
  }
  if (input.content.entity === 'news' && publicImpact(input.content)) {
    revalidateTag(LOCALITY_NEWS_SNAPSHOT_TAG);
  }

  let freshness: PublicIndexingPropagation['freshness'] = {
    status: paths.length ? 'succeeded' : 'skipped',
    queuedCount: 0,
    error: null,
  };
  if (paths.length) {
    try {
      const queuedCount = await queueFreshness(input.content, paths, input.eventKey);
      if (queuedCount === null) {
        freshness = { status: 'skipped', queuedCount: 0, error: 'Chưa cấu hình freshness queue server.' };
      } else {
        freshness.queuedCount = queuedCount;
      }
    } catch (error) {
      freshness = { status: 'degraded', queuedCount: 0, error: errorMessage(error) };
      console.error('[public-indexing] freshness queue degraded:', error);
    }
  }

  let searchVisibility: PublicIndexingPropagation['searchVisibility'] = {
    status: 'skipped',
    runId: null,
    summary: null,
    error: null,
  };
  if (publicImpact(input.content)) {
    try {
      const result = await syncSearchVisibilityAudit(input.actorId);
      searchVisibility = {
        status: 'succeeded',
        runId: result.runId,
        summary: result.summary,
        error: null,
      };
    } catch (error) {
      searchVisibility = {
        status: 'degraded',
        runId: null,
        summary: null,
        error: errorMessage(error),
      };
      console.error('[public-indexing] Search Visibility sync degraded:', error);
    }
  }

  return { paths, freshness, searchVisibility };
}
