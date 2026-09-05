import type { NewsArticle } from './supabase';

type NewsOrderFields = Pick<NewsArticle, 'id' | 'published_at' | 'created_at'>;

export function newsPublishedAt(article: NewsOrderFields): string {
  return article.published_at || article.created_at;
}

export function compareNewsByPublishedAt(a: NewsOrderFields, b: NewsOrderFields): number {
  const dateDifference = Date.parse(newsPublishedAt(b)) - Date.parse(newsPublishedAt(a));
  if (dateDifference !== 0) return dateDifference;
  return b.id.localeCompare(a.id);
}
