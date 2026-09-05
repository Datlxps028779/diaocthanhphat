import { supabase, type Area, type Neighborhood, type NewsArticle, type Property } from '../supabase';
import type {
  ContentRevalidationInput,
  NewsRevalidationSnapshot,
  PropertyRevalidationSnapshot,
  AreaRevalidationSnapshot,
  NeighborhoodRevalidationSnapshot,
  RouteRevalidationSnapshot,
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
  property: Pick<Property, 'id' | 'slug' | 'public_code' | 'listing_type' | 'district' | 'area_id' | 'neighborhood_slug' | 'is_active'>,
): PropertyRevalidationSnapshot {
  return {
    id: property.id,
    slug: property.slug,
    public_code: property.public_code ?? null,
    listing_type: property.listing_type,
    district: property.district,
    area_id: property.area_id,
    neighborhood_slug: property.neighborhood_slug,
    is_active: property.is_active,
  };
}

export function areaRevalidationSnapshot(area: Pick<Area, 'id' | 'slug'>): AreaRevalidationSnapshot {
  return { id: area.id, slug: area.slug };
}

export function neighborhoodRevalidationSnapshot(neighborhood: Pick<Neighborhood, 'id' | 'slug' | 'area_id'>): NeighborhoodRevalidationSnapshot {
  return { id: neighborhood.id, slug: neighborhood.slug, area_id: neighborhood.area_id ?? null };
}

export function routeRevalidationSnapshot(path: string): RouteRevalidationSnapshot {
  return { path };
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

export async function revalidateAreaContent(
  action: RevalidationAction,
  targets: RevalidationTarget<AreaRevalidationSnapshot>[],
): Promise<string[]> {
  return revalidateContent({ entity: 'area', action, targets });
}

export async function revalidateNeighborhoodContent(
  action: RevalidationAction,
  targets: RevalidationTarget<NeighborhoodRevalidationSnapshot>[],
): Promise<string[]> {
  return revalidateContent({ entity: 'neighborhood', action, targets });
}

export async function revalidateRouteContent(
  action: RevalidationAction,
  targets: RevalidationTarget<RouteRevalidationSnapshot>[],
): Promise<string[]> {
  return revalidateContent({ entity: 'route', action, targets });
}

export async function revalidateHomeContent(): Promise<string[]> {
  return revalidateRouteContent('update', [{ current: routeRevalidationSnapshot('/') }]);
}

export async function revalidateSiteWideContent(): Promise<string[]> {
  const { data: managedPages, error } = await supabase
    .from('managed_pages')
    .select('slug')
    .eq('is_active', true);
  if (error) throw error;
  const paths = [
    '/', '/danh-sach', '/mua-ban', '/cho-thue', '/khu-vuc', '/khu-dan-cu',
    '/tin-tuc', '/kien-thuc', '/ve-chung-toi', '/so-sanh', '/dinh-gia',
    '/du-lieu-gia', '/du-an', '/dau-tu',
    ...(managedPages ?? []).map(page => `/trang/${page.slug}`),
  ];
  return revalidateRouteContent('update', [...new Set(paths)].map(path => ({ current: routeRevalidationSnapshot(path) })));
}

async function revalidateContent(input: ContentRevalidationInput): Promise<string[]> {
  const paths = new Set<string>();
  for (let index = 0; index < input.targets.length; index += 60) {
    const response = await fetch('/api/admin/revalidate-content', {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ ...input, targets: input.targets.slice(index, index + 60) }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error ?? 'Không làm mới được cache.');
    if (Array.isArray(json.paths)) {
      json.paths.filter((path: unknown): path is string => typeof path === 'string').forEach((path: string) => paths.add(path));
    }
  }
  return [...paths];
}
