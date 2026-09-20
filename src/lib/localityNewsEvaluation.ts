import type { NewsListItem } from './supabase';
import { isValidSlug } from './slug';
import { dedupeLocalityNews, localityNewsMatches, normalizeLocalityLabel, LOCALITY_NEWS_MINIMUM } from './localityNewsMatch';

export const LOCALITY_NEWS_SNAPSHOT_UNAVAILABLE = 'Locality news snapshot unavailable';
export type LocalityNewsSnapshotRow = NewsListItem & {
  is_published: boolean;
  area_id: string | null;
  district_id: string | null;
  ward_id: string | null;
};
export type LocalityNewsEvaluation = { data: NewsListItem[]; total: number; indexable: boolean; latestUpdatedAt: string | null };

type Row = Record<string, unknown> & { id: string };

export function toNewsListItem(row: Row): NewsListItem {
  return {
    id: row.id,
    title: (row.title ?? '') as string,
    slug: (row.slug ?? '') as string,
    excerpt: (row.excerpt ?? null) as string | null,
    image_url: (row.image_url ?? null) as string | null,
    category: (row.category ?? '') as string,
    author: (row.author ?? '') as string,
    views: (row.views ?? 0) as number,
    focus_keywords: (row.focus_keywords ?? null) as string | null,
    geo_area: (row.geo_area ?? null) as string | null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at ?? row.created_at) as string,
  };
}

function compareNewsDescending(a: Row, b: Row): number {
  const time = (row: Row) => {
    const parsed = Date.parse(String(row.created_at ?? ''));
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  const timeA = time(a), timeB = time(b);
  if (timeA !== timeB) return timeB - timeA;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

function latestTimestamp(rows: readonly Row[]): string | null {
  return rows.reduce<string | null>((latest, row) => {
    const candidate = typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at))
      ? row.updated_at
      : typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)) ? row.created_at : null;
    if (!candidate) return latest;
    if (!latest || Date.parse(candidate) > Date.parse(latest)) return candidate;
    return latest;
  }, null);
}

export function evaluateLocalityNews(
  rows: readonly unknown[], areaId: string, allowlist: Iterable<string>, limit = 12,
): LocalityNewsEvaluation {
  if (!areaId.trim() || !Number.isSafeInteger(limit) || limit <= 0) throw new Error(LOCALITY_NEWS_SNAPSHOT_UNAVAILABLE);
  const labels = new Set(Array.from(allowlist, normalizeLocalityLabel).filter(Boolean));
  const matched: Row[] = [];
  for (const value of rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Row;
    if (typeof row.id !== 'string' || !row.id || row.is_published !== true || !isValidSlug(typeof row.slug === 'string' ? row.slug : null)) continue;
    if (localityNewsMatches({ id: row.id, area_id: row.area_id as string | null, geo_area: row.geo_area as string | null }, areaId, labels)) matched.push(row);
  }
  const ordered = dedupeLocalityNews(matched).sort(compareNewsDescending);
  return {
    data: ordered.slice(0, limit).map(toNewsListItem),
    total: ordered.length,
    indexable: ordered.length >= LOCALITY_NEWS_MINIMUM,
    latestUpdatedAt: latestTimestamp(ordered),
  };
}
