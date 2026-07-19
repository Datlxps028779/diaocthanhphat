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
    const a = byId.get(id);
    if (a && !seen.has(id)) {
      out.push(a);
      seen.add(id);
    }
  }

  if (out.length < limit) {
    const rest = pool
      .filter(a => !seen.has(a.id))
      .sort((x, y) => relatedScore(current, y, now) - relatedScore(current, x, now));
    for (const a of rest) {
      if (out.length >= limit) break;
      out.push(a);
      seen.add(a.id);
    }
  }

  return out.slice(0, limit);
}
