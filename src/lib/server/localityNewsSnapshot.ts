import { unstable_cache } from 'next/cache';
import { loadLocalityNewsSnapshot, type LocalityNewsSnapshot } from './localityNewsSnapshotTransport';

export { evaluateLocalityNews, LOCALITY_NEWS_SNAPSHOT_UNAVAILABLE } from '../localityNewsEvaluation';
export { loadLocalityNewsSnapshot } from './localityNewsSnapshotTransport';
export { type LocalityNewsSnapshot, type LocalityNewsSnapshotOptions } from './localityNewsSnapshotTransport';
export const LOCALITY_NEWS_SNAPSHOT_TAG = 'public-locality-news-snapshot';
export const LOCALITY_NEWS_REVALIDATE_SECONDS = 60;

const cached = unstable_cache(() => loadLocalityNewsSnapshot(), ['locality-news-snapshot'], {
  revalidate: LOCALITY_NEWS_REVALIDATE_SECONDS, tags: [LOCALITY_NEWS_SNAPSHOT_TAG],
});
export const getLocalityNewsSnapshot: () => Promise<LocalityNewsSnapshot> = () => cached();
