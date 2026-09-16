import { aggregateHomeLocationStats, type HomeLocationPropertyRow, type HomeLocationStats } from '../homeLocationStats';

const SELECT = 'id,area_id,district_id,listing_type,price,price_unit,price_per_month,area_sqm';
const UNAVAILABLE = 'Location statistics unavailable';
const MAX_ROWS = 5_000;
const MAX_PAGES = 50;
const MAX_PAGE_SIZE = 500;
const TIMEOUT_MS = 15_000;

/** Injection is server/test-only. The HTTP endpoint does not accept loader options. */
export type HomeLocationStatsLoaderOptions = {
  fetcher?: typeof fetch;
  url?: string;
  anonKey?: string;
  pageSize?: number;
  maxRows?: number;
  maxPages?: number;
  timeoutMs?: number;
};

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) throw new Error(UNAVAILABLE);
  return result;
}

function parseRow(value: unknown): HomeLocationPropertyRow {
  if (!value || typeof value !== 'object') throw new Error(UNAVAILABLE);
  const row = value as Record<string, unknown>;
  // PostgREST returns UUIDs. Restrict cursor syntax even though values originate from the DB.
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(row.id)) throw new Error(UNAVAILABLE);
  for (const field of ['area_id', 'district_id', 'listing_type', 'price_unit']) {
    if (row[field] !== null && typeof row[field] !== 'string') throw new Error(UNAVAILABLE);
  }
  for (const field of ['price', 'price_per_month', 'area_sqm']) {
    if (row[field] !== null && typeof row[field] !== 'number') throw new Error(UNAVAILABLE);
  }
  // Explicit projection also drops unexpected upstream fields before aggregation.
  return {
    id: row.id, area_id: row.area_id as string | null, district_id: row.district_id as string | null,
    listing_type: row.listing_type as string | null, price: row.price as number | null,
    price_unit: row.price_unit as string | null, price_per_month: row.price_per_month as number | null,
    area_sqm: row.area_sqm as number | null,
  };
}

/**
 * Complete, bounded anonymous read. Each keyset query's exact count is the remaining
 * count after its cursor, not the initial total. Any mismatch fails closed. The last
 * probe detects a changed global count, including inserts/deletes behind the cursor.
 * This is not a transactional snapshot of concurrent price edits.
 */
export async function loadHomeLocationStats(options: HomeLocationStatsLoaderOptions = {}): Promise<HomeLocationStats> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const pageSize = bounded(options.pageSize, MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    const maxRows = bounded(options.maxRows, MAX_ROWS, MAX_ROWS);
    const maxPages = bounded(options.maxPages, MAX_PAGES, MAX_PAGES);
    const timeoutMs = bounded(options.timeoutMs, TIMEOUT_MS, TIMEOUT_MS);
    const url = options.url ?? (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    const anonKey = options.anonKey ?? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    if (!url || !anonKey) throw new Error(UNAVAILABLE);
    const endpoint = new URL(`${url.replace(/\/$/, '')}/rest/v1/public_properties`);
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error(UNAVAILABLE);
    }
    const fetcher = options.fetcher ?? fetch;
    const readPage = async (cursor: string | null, limit: number) => {
      if (controller.signal.aborted) throw new Error(UNAVAILABLE);
      const requestUrl = new URL(endpoint);
      requestUrl.searchParams.set('select', SELECT);
      requestUrl.searchParams.set('is_active', 'eq.true');
      requestUrl.searchParams.set('order', 'id.asc');
      requestUrl.searchParams.set('limit', String(limit));
      if (cursor) requestUrl.searchParams.set('id', `gt.${cursor}`);
      const response = await fetcher(requestUrl.toString(), {
        method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Prefer: 'count=exact' },
      });
      if (!response.ok) throw new Error(UNAVAILABLE);
      const range = response.headers.get('content-range')?.match(/^(\*|0-(\d+))\/(\d+)$/);
      if (!range) throw new Error(UNAVAILABLE);
      const count = Number(range[3]);
      if (!Number.isSafeInteger(count) || count > maxRows) throw new Error(UNAVAILABLE);
      const body: unknown = await response.json();
      if (!Array.isArray(body) || body.length > limit || body.length > count) throw new Error(UNAVAILABLE);
      if (body.length === 0 ? range[1] !== '*' : Number(range[2]) !== body.length - 1) throw new Error(UNAVAILABLE);
      const rows = body.map(parseRow);
      return { count, rows };
    };

    const readComplete = async () => {
      const rows: HomeLocationPropertyRow[] = [];
      let total: number | undefined;
      let cursor: string | null = null;
      let pages = 0;
      do {
        if (++pages > maxPages || controller.signal.aborted) throw new Error(UNAVAILABLE);
        const page = await readPage(cursor, Math.min(pageSize, maxRows - rows.length));
        total ??= page.count;
        if (page.count !== total - rows.length || (page.rows.length === 0 && rows.length !== total)) throw new Error(UNAVAILABLE);
        for (const row of page.rows) {
          if (cursor !== null && row.id <= cursor) throw new Error(UNAVAILABLE);
          cursor = row.id;
          rows.push(row);
        }
      } while (rows.length < total);
      const verification = await readPage(null, 1);
      if (verification.count !== total || verification.rows.length !== Math.min(1, total)
        || verification.rows[0]?.id !== rows[0]?.id) throw new Error(UNAVAILABLE);
      return aggregateHomeLocationStats(rows);
    };

    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(UNAVAILABLE));
      }, timeoutMs);
    });
    return await Promise.race([readComplete(), deadline]);
  } catch {
    // Never leak raw upstream bodies, URLs, credentials, row data, or network errors.
    controller.abort();
    throw new Error(UNAVAILABLE);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
