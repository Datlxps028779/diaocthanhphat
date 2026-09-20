import { resolveLocalityPageContext, type LocalityTaxonomy } from './localityPageContext';
import { districtDisplaySlug } from './areaPath';
import { salePriceBandPostgrestFilter } from './localityListingScope';

type RequestOptions = { url: string; anonKey: string; fetcher?: typeof fetch };
type RequestResult = { status: 'valid'; path: string } | { status: 'not-found' } | { status: 'unavailable' };
const PAGE_SIZE = 500;
const CAP = 5000;

export async function checkLocalityRequest(path: string, options: RequestOptions): Promise<RequestResult> {
  let segments: string[];
  try { segments = path.split('/').filter(Boolean).map(decodeURIComponent); } catch { return { status: 'not-found' }; }
  if (segments.length < 2 || segments.length > 7 || segments.some(segment => !/^[a-z0-9][a-z0-9-]*$/.test(segment))) return { status: 'not-found' };
  if (segments.some(segment => /-pr\d+$/.test(segment))) return { status: 'not-found' };
  if (!['khu-vuc', 'mua-ban', 'cho-thue'].includes(segments[0])) return { status: 'not-found' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const fetcher = options.fetcher ?? fetch;
  const headers = { apikey: options.anonKey, Authorization: `Bearer ${options.anonKey}`, Prefer: 'count=exact' };
  const endpoint = (table: string, params: Record<string, string>) => {
    const url = new URL(`${options.url.replace(/\/$/, '')}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  };
  const read = async <T extends { id: string }>(table: string, select: string, filters: Record<string, string>): Promise<T[]> => {
    const readPage = async (cursor: string, limit: number) => {
      if (controller.signal.aborted) throw new Error('Unavailable');
      const response = await fetcher(endpoint(table, {
        select,
        ...filters,
        order: 'id.asc',
        limit: String(limit),
        ...(cursor ? { id: `gt.${cursor}` } : {}),
      }), { method: 'GET', headers, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const range = response.headers.get('content-range')?.match(/^(\*|0-(\d+))\/(\d+)$/);
      const count = range ? Number(range[3]) : NaN;
      const page: unknown = await response.json();
      if (!Number.isSafeInteger(count) || !Array.isArray(page) || page.length > limit) throw new Error('Unavailable');
      if (page.length === 0 ? range?.[1] !== '*' : Number(range?.[2]) !== page.length - 1) throw new Error('Unavailable');
      const rows = page.map(item => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id)) throw new Error('Unavailable');
        for (const field of select.split(',')) {
          if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error('Unavailable');
        }
        return item as T;
      });
      return { count, rows };
    };

    const rows: T[] = [];
    let cursor = '';
    let total: number | undefined;
    while (true) {
      const pageResult = await readPage(cursor, PAGE_SIZE);
      if (total === undefined) total = pageResult.count;
      if (total > CAP || rows.length + pageResult.count !== total) throw new Error('Unavailable');
      for (const item of pageResult.rows) {
        if (item.id <= cursor) throw new Error('Unavailable');
        cursor = item.id;
        rows.push(item);
      }
      if (rows.length > total || rows.length > CAP) throw new Error('Unavailable');
      if (pageResult.rows.length < PAGE_SIZE) {
        if (rows.length !== total) throw new Error('Unavailable');
        const verification = await readPage('', 1);
        if (verification.count !== total || verification.rows[0]?.id !== rows[0]?.id) throw new Error('Unavailable');
        return rows;
      }
    }
  };
  try {
    const areas = await read<LocalityTaxonomy['areas'][number]>('areas', 'id,slug,name', { slug: `eq.${segments[1]}` });
    if (areas.length !== 1) return { status: 'not-found' };
    const [districts, propertyTypes] = await Promise.all([
      read<LocalityTaxonomy['districts'][number]>('districts', 'id,area_id,slug,name', { area_id: `eq.${areas[0].id}` }),
      read<LocalityTaxonomy['propertyTypes'][number]>('property_types', 'id,slug,name', {}),
    ]);
    const district = districts.find(item => item.slug === segments[2] || districtDisplaySlug(areas[0].slug, item.slug) === segments[2]);
    const wards = district && segments[3] === 'phuong-xa'
      ? await read<LocalityTaxonomy['wards'][number]>('wards', 'id,district_id,slug,name', { district_id: `eq.${district.id}` }) : [];
    const context = resolveLocalityPageContext(path, { areas, districts, wards, propertyTypes });
    if (!context) return { status: 'not-found' };
    if (context.typeNamespaced || context.priceBand) {
      if (context.typeNamespaced && context.propertyTypeIds.length === 0) return { status: 'not-found' };
      const params: Record<string, string> = { select: 'id', is_active: 'eq.true', area_id: `eq.${context.areaId}`, listing_type: `eq.${context.listingType}` };
      if (context.propertyTypeIds.length) params.property_type_id = `in.(${context.propertyTypeIds.join(',')})`;
      if (context.priceBand) {
        const expression = salePriceBandPostgrestFilter(context.priceBand);
        if (!expression) return { status: 'not-found' };
        params.or = `(${expression})`;
      }
      const response = await fetcher(endpoint('public_properties', params), { method: 'HEAD', headers, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const count = response.headers.get('content-range')?.match(/\/(\d+)$/);
      if (!count) throw new Error('Unavailable');
      if (Number(count[1]) === 0) return { status: 'not-found' };
    }
    return { status: 'valid', path: context.path };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
