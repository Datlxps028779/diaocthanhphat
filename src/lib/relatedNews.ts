import type { NewsArticle } from './supabase';

export function keywordSet(a: Pick<NewsArticle, 'focus_keywords'>): Set<string> {
  return new Set(
    (a.focus_keywords ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function relatedScore(current: NewsArticle, cand: NewsArticle, now: number): number {
  let score = 0;
  if (cand.category && cand.category === current.category) score += 5;

  const cur = keywordSet(current);
  let overlap = 0;
  for (const k of keywordSet(cand)) if (cur.has(k)) overlap++;
  score += overlap * 3;

  const ageDays = Math.max(0, (now - new Date(cand.created_at).getTime()) / 86_400_000);
  score += Math.max(0, 2 - ageDays / 30);

  return score;
}


export function pickRelated(
  current: NewsArticle,
  manualIds: string[],
  pool: NewsArticle[],
  limit = 5,
  now = 0,
): NewsArticle[] {
  const byId = new Map(pool.map(a => [a.id, a]));
  const out: NewsArticle[] = [];
  const seen = new Set<string>([current.id]);

  for (const id of manualIds) {
    const article = byId.get(id);
    if (article && !seen.has(id)) {
      out.push(article);
      seen.add(id);
    }
  }

  if (out.length < limit) {
    const rest = pool
      .filter(article => !seen.has(article.id))
      .sort((left, right) => {
        const scoreDelta = relatedScore(current, right, now) - relatedScore(current, left, now);
        if (scoreDelta !== 0) return scoreDelta;

        const createdDelta = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        if (createdDelta !== 0) return createdDelta;

        return left.id.localeCompare(right.id);
      });
    for (const article of rest) {
      if (out.length >= limit) break;
      out.push(article);
      seen.add(article.id);
    }
  }

  return out.slice(0, limit);
}

export type ArticleDiscoveryItem = Pick<NewsArticle, 'id'>;

export type ArticleDiscoveryPools<T extends ArticleDiscoveryItem> = {
  sidebarRelated: T[];
  sidebarPopular: T[];
  continuation: T[];
  mobileContinuation: T[];
};

function takeDistinct<T extends ArticleDiscoveryItem>(
  items: T[],
  excluded: ReadonlySet<string>,
  limit: number,
): T[] {
  const seen = new Set(excluded);
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

// Chia pool bài thật thành các vai trò UX riêng: desktop giữ bài liên quan/đọc nhiều
// ở sidebar để tránh lặp card. Mobile không có sidebar, nên gom các bài đã giữ lại vào
// continuation riêng để không làm mất đường đọc tiếp quan trọng.
export function buildArticleDiscoveryPools<T extends ArticleDiscoveryItem>(
  currentId: string,
  related: T[],
  popular: T[],
  latest: T[],
): ArticleDiscoveryPools<T> {
  const current = new Set([currentId]);
  const sidebarRelated = takeDistinct(related, current, 3);
  const sidebarPopular = takeDistinct(popular, new Set([...current, ...sidebarRelated.map(item => item.id)]), 3);
  const sidebarIds = new Set([...current, ...sidebarRelated.map(item => item.id), ...sidebarPopular.map(item => item.id)]);
  const continuation = takeDistinct(
    [...related.slice(sidebarRelated.length), ...latest, ...popular],
    sidebarIds,
    6,
  );
  const mobileContinuation = takeDistinct(
    [...sidebarRelated, ...sidebarPopular, ...continuation],
    current,
    6,
  );

  return { sidebarRelated, sidebarPopular, continuation, mobileContinuation };
}
