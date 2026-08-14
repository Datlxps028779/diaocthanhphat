import { supabase, type NewsArticle, type Property } from '../supabase';
import type {
  ContentRevalidationInput,
  NewsRevalidationSnapshot,
  PropertyRevalidationSnapshot,
  RevalidationAction,
  RevalidationTarget,
} from '../server/contentRevalidation';

export function newsRevalidationSnapshot(article: Pick<NewsArticle, 'id' | 'slug' | 'category' | 'is_published'>): NewsRevalidationSnapshot {
  return {
    id: article.id,
    slug: article.slug,
    category: article.category,
    is_published: article.is_published,
  };
}

export function propertyRevalidationSnapshot(
  property: Pick<Property, 'id' | 'slug' | 'public_code' | 'listing_type' | 'district' | 'area_id' | 'is_active'>,
): PropertyRevalidationSnapshot {
  return {
    id: property.id,
    slug: property.slug,
    public_code: property.public_code ?? null,
    listing_type: property.listing_type,
    district: property.district,
    area_id: property.area_id,
    is_active: property.is_active,
  };
}

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

export async function revalidateNewsContent(
  action: RevalidationAction,
  targets: RevalidationTarget<NewsRevalidationSnapshot>[],
): Promise<string[]> {
  return revalidateContent({ entity: 'news', action, targets });
}

export async function revalidatePropertyContent(
  action: RevalidationAction,
  targets: RevalidationTarget<PropertyRevalidationSnapshot>[],
): Promise<string[]> {
  return revalidateContent({ entity: 'property', action, targets });
}

async function revalidateContent(input: ContentRevalidationInput): Promise<string[]> {
  const response = await fetch('/api/admin/revalidate-content', {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify(input),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? 'Không làm mới được cache.');
  return Array.isArray(json.paths) ? json.paths.filter((path: unknown): path is string => typeof path === 'string') : [];
}
