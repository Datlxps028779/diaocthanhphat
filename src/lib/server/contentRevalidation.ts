import { buildProductPath } from '../productPath';

export type RevalidationEntity = 'news' | 'property' | 'area' | 'neighborhood' | 'route';
export type RevalidationAction = 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'bulk';

export type NewsRevalidationSnapshot = {
  id: string;
  slug: string | null;
  category: string | null;
  is_published: boolean;
};

export type PropertyRevalidationSnapshot = {
  id: string;
  slug: string | null;
  public_code: number | null;
  listing_type: 'mua_ban' | 'cho_thue' | null;
  district: string | null;
  area_id: string | null;
  neighborhood_slug?: string | null;
  is_active: boolean;
};

export type AreaRevalidationSnapshot = {
  id: string;
  slug: string | null;
};

export type NeighborhoodRevalidationSnapshot = {
  id: string;
  slug: string | null;
  area_id: string | null;
};

export type RouteRevalidationSnapshot = {
  path: string;
};

export type RevalidationSnapshot =
  | NewsRevalidationSnapshot
  | PropertyRevalidationSnapshot
  | AreaRevalidationSnapshot
  | NeighborhoodRevalidationSnapshot
  | RouteRevalidationSnapshot;
export type RevalidationLookups = {
  areaSlugs: ReadonlyMap<string, string>;
  categorySlugs: ReadonlyMap<string, string>;
};

export type RevalidationTarget<T> = {
  current?: T;
  previous?: T;
};

export type ContentRevalidationInput =
  | { entity: 'news'; action: RevalidationAction; targets: RevalidationTarget<NewsRevalidationSnapshot>[] }
  | { entity: 'property'; action: RevalidationAction; targets: RevalidationTarget<PropertyRevalidationSnapshot>[] }
  | { entity: 'area'; action: RevalidationAction; targets: RevalidationTarget<AreaRevalidationSnapshot>[] }
  | { entity: 'neighborhood'; action: RevalidationAction; targets: RevalidationTarget<NeighborhoodRevalidationSnapshot>[] }
  | { entity: 'route'; action: RevalidationAction; targets: RevalidationTarget<RouteRevalidationSnapshot>[] };


const ACTIONS = new Set<RevalidationAction>(['create', 'update', 'delete', 'publish', 'unpublish', 'bulk']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function asTrimmedString(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function optionalText(value: unknown, max = 200): string | null {
  if (value == null || value === '') return null;
  return asTrimmedString(value, max);
}

function optionalSlug(value: unknown): string | null {
  const slug = optionalText(value, 220);
  return slug && SLUG_RE.test(slug) ? slug : null;
}

function optionalId(value: unknown): string | null {
  const id = asTrimmedString(value, 128);
  return id && ID_RE.test(id) ? id : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseNewsSnapshot(value: unknown): NewsRevalidationSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = optionalId(record.id);
  const isPublished = optionalBoolean(record.is_published);
  if (!id || isPublished == null) return null;
  return {
    id,
    slug: optionalSlug(record.slug),
    category: optionalText(record.category, 120),
    is_published: isPublished,
  };
}

function parsePropertySnapshot(value: unknown): PropertyRevalidationSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = optionalId(record.id);
  const isActive = optionalBoolean(record.is_active);
  const listingType = record.listing_type === 'mua_ban' || record.listing_type === 'cho_thue' ? record.listing_type : null;
  const publicCode = typeof record.public_code === 'number' && Number.isSafeInteger(record.public_code) && record.public_code > 0
    ? record.public_code
    : null;
  if (!id || isActive == null) return null;
  return {
    id,
    slug: optionalSlug(record.slug),
    public_code: publicCode,
    listing_type: listingType,
    district: optionalText(record.district, 120),
    area_id: optionalId(record.area_id),
    neighborhood_slug: optionalSlug(record.neighborhood_slug),
    is_active: isActive,
  };
}


const ROUTE_PATHS = new Set([
  '/', '/danh-sach', '/mua-ban', '/cho-thue', '/khu-vuc', '/khu-dan-cu',
  '/tin-tuc', '/kien-thuc', '/ve-chung-toi', '/so-sanh', '/dinh-gia',
  '/du-lieu-gia', '/du-an', '/dau-tu',
]);
const PUBLIC_SLUG_PATH_RE = /^\/(?:trang|tin-tuc\/danh-muc)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isAllowedRoutePath(path: string): boolean {
  return ROUTE_PATHS.has(path) || PUBLIC_SLUG_PATH_RE.test(path);
}

function parseAreaSnapshot(value: unknown): AreaRevalidationSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = optionalId(record.id);
  if (!id) return null;
  return { id, slug: optionalSlug(record.slug) };
}

function parseNeighborhoodSnapshot(value: unknown): NeighborhoodRevalidationSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = optionalId(record.id);
  if (!id) return null;
  return { id, slug: optionalSlug(record.slug), area_id: optionalId(record.area_id) };
}

function parseRouteSnapshot(value: unknown): RouteRevalidationSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const path = asTrimmedString((value as Record<string, unknown>).path, 200);
  return path && isAllowedRoutePath(path) ? { path } : null;
}


export function parseContentRevalidationInput(body: unknown): { input?: ContentRevalidationInput; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Payload không hợp lệ.' };
  const record = body as Record<string, unknown>;
  const entity = record.entity;
  const action = record.action;
  const targets = record.targets;
  if ((entity !== 'news' && entity !== 'property' && entity !== 'area' && entity !== 'neighborhood' && entity !== 'route') || typeof action !== 'string' || !ACTIONS.has(action as RevalidationAction)) {
    return { error: 'Entity hoặc action không hợp lệ.' };
  }
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 60) {
    return { error: 'Cần 1–60 mục nội dung để làm mới cache.' };
  }

  if (entity === 'news') {
    const parsed: RevalidationTarget<NewsRevalidationSnapshot>[] = [];
    for (const target of targets) {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return { error: 'Target tin tức không hợp lệ.' };
      const source = target as Record<string, unknown>;
      const current = source.current == null ? undefined : parseNewsSnapshot(source.current);
      const previous = source.previous == null ? undefined : parseNewsSnapshot(source.previous);
      if ((!current && source.current != null) || (!previous && source.previous != null) || (!current && !previous)) {
        return { error: 'Thông tin tin tức không hợp lệ.' };
      }
      parsed.push({ current: current ?? undefined, previous: previous ?? undefined });
    }
    return { input: { entity, action: action as RevalidationAction, targets: parsed } };
  }

  if (entity === 'area' || entity === 'neighborhood' || entity === 'route') {
    const parsed: RevalidationTarget<RevalidationSnapshot>[] = [];
    for (const target of targets) {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return { error: 'Target taxonomy không hợp lệ.' };
      const source = target as Record<string, unknown>;
      const parse = entity === 'area' ? parseAreaSnapshot : entity === 'neighborhood' ? parseNeighborhoodSnapshot : parseRouteSnapshot;
      const current = source.current == null ? undefined : parse(source.current);
      const previous = source.previous == null ? undefined : parse(source.previous);
      if ((!current && source.current != null) || (!previous && source.previous != null) || (!current && !previous)) {
        return { error: 'Thông tin taxonomy không hợp lệ.' };
      }
      parsed.push({ current: current ?? undefined, previous: previous ?? undefined });
    }
    if (entity === 'area') return { input: { entity, action: action as RevalidationAction, targets: parsed as RevalidationTarget<AreaRevalidationSnapshot>[] } };
    if (entity === 'neighborhood') return { input: { entity, action: action as RevalidationAction, targets: parsed as RevalidationTarget<NeighborhoodRevalidationSnapshot>[] } };
    return { input: { entity, action: action as RevalidationAction, targets: parsed as RevalidationTarget<RouteRevalidationSnapshot>[] } };
  }

  const parsed: RevalidationTarget<PropertyRevalidationSnapshot>[] = [];
  for (const target of targets) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) return { error: 'Target sản phẩm không hợp lệ.' };
    const source = target as Record<string, unknown>;
    const current = source.current == null ? undefined : parsePropertySnapshot(source.current);
    const previous = source.previous == null ? undefined : parsePropertySnapshot(source.previous);
    if ((!current && source.current != null) || (!previous && source.previous != null) || (!current && !previous)) {
      return { error: 'Thông tin sản phẩm không hợp lệ.' };
    }
    parsed.push({ current: current ?? undefined, previous: previous ?? undefined });
  }
  return { input: { entity, action: action as RevalidationAction, targets: parsed } };
}

function addNewsPaths(paths: Set<string>, snapshot: NewsRevalidationSnapshot, lookups: RevalidationLookups) {
  if (!snapshot.is_published) return;
  paths.add('/');
  paths.add('/tin-tuc');
  paths.add('/kien-thuc');
  paths.add('/sitemap.xml');
  if (snapshot.slug) paths.add(`/tin-tuc/${snapshot.slug}`);
  const categorySlug = snapshot.category ? lookups.categorySlugs.get(snapshot.category) : undefined;
  if (categorySlug) paths.add(`/tin-tuc/danh-muc/${categorySlug}`);
}

function addPropertyPaths(paths: Set<string>, snapshot: PropertyRevalidationSnapshot, lookups: RevalidationLookups) {
  if (!snapshot.is_active) return;
  paths.add('/');
  paths.add('/danh-sach');
  paths.add('/mua-ban');
  paths.add('/cho-thue');
  paths.add('/sitemap.xml');
  paths.add('/sitemap-images.xml');
  if (snapshot.slug) paths.add(`/bat-dong-san/${snapshot.slug}`);
  if (snapshot.neighborhood_slug) paths.add(`/khu-dan-cu/${snapshot.neighborhood_slug}`);

  const areaSlug = snapshot.area_id ? lookups.areaSlugs.get(snapshot.area_id) : undefined;
  if (!areaSlug || !snapshot.listing_type) return;
  paths.add(`/khu-vuc/${areaSlug}`);
  const listingBase = snapshot.listing_type === 'mua_ban' ? '/mua-ban' : '/cho-thue';
  paths.add(`${listingBase}/${areaSlug}`);
  if (snapshot.district) {
    // buildProductPath dùng cùng slug builder với route khu vực, tránh tự nối URL khác format.
    const canonical = buildProductPath({
      id: snapshot.id,
      slug: snapshot.slug,
      public_code: snapshot.public_code,
      listing_type: snapshot.listing_type,
      district: snapshot.district,
      areas: { slug: areaSlug },
    });
    paths.add(canonical);
    const segments = canonical.split('/').filter(Boolean);
    if (segments.length >= 3) paths.add(`/${segments.slice(0, -1).join('/')}`);
  }
}

function addAreaPaths(paths: Set<string>, snapshot: AreaRevalidationSnapshot, includeSitemap = true) {
  paths.add('/');
  paths.add('/khu-vuc');
  if (snapshot.slug) {
    paths.add(`/khu-vuc/${snapshot.slug}`);
    paths.add(`/mua-ban/${snapshot.slug}`);
    paths.add(`/cho-thue/${snapshot.slug}`);
  }
  if (includeSitemap) paths.add('/sitemap.xml');
}

function addNeighborhoodPaths(paths: Set<string>, snapshot: NeighborhoodRevalidationSnapshot, lookups: RevalidationLookups) {
  paths.add('/');
  paths.add('/khu-dan-cu');
  if (snapshot.slug) paths.add(`/khu-dan-cu/${snapshot.slug}`);
  const areaSlug = snapshot.area_id ? lookups.areaSlugs.get(snapshot.area_id) : undefined;
  if (areaSlug) paths.add(`/khu-vuc/${areaSlug}`);
  paths.add('/sitemap.xml');
}

function addRoutePaths(paths: Set<string>, snapshot: RouteRevalidationSnapshot) {
  paths.add(snapshot.path);
  if (snapshot.path !== '/') paths.add('/sitemap.xml');
}

// Chỉ dựng URL public nằm trong allowlist cố định. Client không thể gửi path tùy ý.
export function collectContentRevalidationPaths(input: ContentRevalidationInput, lookups: RevalidationLookups): string[] {
  const paths = new Set<string>();
  if (input.entity === 'news') {
    input.targets.forEach(({ current, previous }) => {
      if (current) addNewsPaths(paths, current, lookups);
      if (previous) addNewsPaths(paths, previous, lookups);
    });
  } else if (input.entity === 'property') {
    input.targets.forEach(({ current, previous }) => {
      if (current) addPropertyPaths(paths, current, lookups);
      if (previous) addPropertyPaths(paths, previous, lookups);
    });
  } else if (input.entity === 'area') {
    input.targets.forEach(({ current, previous }) => {
      if (current) addAreaPaths(paths, current);
      if (previous) addAreaPaths(paths, previous);
    });
  } else if (input.entity === 'neighborhood') {
    input.targets.forEach(({ current, previous }) => {
      if (current) addNeighborhoodPaths(paths, current, lookups);
      if (previous) addNeighborhoodPaths(paths, previous, lookups);
    });
  } else {
    input.targets.forEach(({ current, previous }) => {
      if (current) addRoutePaths(paths, current);
      if (previous) addRoutePaths(paths, previous);
    });
  }
  return [...paths].sort();
}
