import { LOCALITY_NEWS_SNAPSHOT_UNAVAILABLE, toNewsListItem, type LocalityNewsSnapshotRow } from '../localityNewsEvaluation';
import { readBoundedPublicRows, type BoundedRowValidators } from './boundedPublicRows';

export type LocalityNewsSnapshot = LocalityNewsSnapshotRow[];
export type LocalityNewsSnapshotOptions = {
  fetcher?: typeof fetch;
  url?: string;
  anonKey?: string;
  pageSize?: number;
  maxRows?: number;
  maxPages?: number;
  timeoutMs?: number;
};

const NEWS_SELECT = [
  'id', 'title', 'slug', 'excerpt', 'image_url', 'category', 'author', 'views',
  'focus_keywords', 'geo_area', 'area_id', 'district_id', 'ward_id',
  'is_published', 'created_at', 'updated_at',
] as const;
const NEWS_VALIDATORS: BoundedRowValidators = {
  stringFields: NEWS_SELECT.filter(field => !['id', 'views', 'is_published'].includes(field)),
  numberFields: ['views'],
  booleanFields: ['is_published'],
  requiredFields: ['is_published', 'created_at'],
};

export async function loadLocalityNewsSnapshot(options: LocalityNewsSnapshotOptions = {}): Promise<LocalityNewsSnapshot> {
  try {
    const rows = await readBoundedPublicRows({
      ...options,
      table: 'news',
      select: NEWS_SELECT.join(','),
      filters: { is_published: 'eq.true' },
      validators: NEWS_VALIDATORS,
    });
    return rows.map(row => {
      if (row.is_published !== true || !Number.isFinite(Date.parse(String(row.created_at)))) throw new Error(LOCALITY_NEWS_SNAPSHOT_UNAVAILABLE);
      return {
        ...toNewsListItem(row), is_published: true,
        area_id: row.area_id as string | null,
        district_id: row.district_id as string | null,
        ward_id: row.ward_id as string | null,
      };
    });
  } catch {
    throw new Error(LOCALITY_NEWS_SNAPSHOT_UNAVAILABLE);
  }
}
