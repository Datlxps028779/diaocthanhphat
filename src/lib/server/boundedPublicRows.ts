// Transport đọc bảng public hoàn chỉnh + có giới hạn, dùng chung cho mọi loader
// (thống kê trang chủ, snapshot địa phương, snapshot tin tức). Chỉ anonymous GET,
// không cookie/session, keyset pagination theo id, exact count mỗi trang và probe
// cuối. Fail closed: mọi bất thường ném lỗi chung, KHÔNG trả dữ liệu một phần và
// KHÔNG rò rỉ nội dung upstream.
//
// Đây là phần INTERNAL: filter và validator do loader gọi truyền vào, nên thêm bảng
// mới không cần đụng vào transport. Các wrapper cố định (public_properties) nằm ở
// boundedPublicRead.ts và giữ nguyên API công khai của chúng.

export const BOUNDED_ROWS_UNAVAILABLE = 'Public rows unavailable';
export const BOUNDED_ROW_MAX_ROWS = 5_000;
export const BOUNDED_ROW_MAX_PAGES = 50;
export const BOUNDED_ROW_PAGE_SIZE = 500;
export const BOUNDED_ROW_TIMEOUT_MS = 15_000;

/**
 * Kiểm tra shape của một row upstream TRƯỚC khi nó được dùng để tổng hợp công khai.
 * Chỉ được khai báo những cột nằm trong projection của loader.
 */
export type BoundedRowValidators = {
  /** Cột chuỗi nullable; cột `*_id` phải là slug an toàn. */
  stringFields?: readonly string[];
  /** Cột số nullable; `NaN`/`Infinity` bị coi là hỏng dữ liệu. */
  numberFields?: readonly string[];
  /** Cột boolean nullable. */
  booleanFields?: readonly string[];
  /** Cột không được null/undefined (ví dụ is_published, created_at). */
  requiredFields?: readonly string[];
};

export type BoundedRowsOptions = {
  fetcher?: typeof fetch;
  url?: string;
  anonKey?: string;
  pageSize?: number;
  maxRows?: number;
  maxPages?: number;
  timeoutMs?: number;
  /** Bảng REST cần đọc; chỉ chữ thường và dấu gạch dưới. */
  table: string;
  /** Cột PostgREST cần lấy. */
  select: string;
  /** Filter cố định của loader, gắn vào MỌI trang (ví dụ `{ is_published: 'eq.true' }`). */
  filters?: Record<string, string>;
  validators: BoundedRowValidators;
};

export type BoundedPublicRow = Record<string, unknown> & { id: string };

/** Chỉ nhận số nguyên dương trong khoảng cho phép; mọi giá trị khác fail closed. */
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  return result;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_TABLE = /^[a-z_]+$/;
const SAFE_FILTER_KEY = /^[a-z_][a-z0-9_]*$/;

function validateRow(value: unknown, select: readonly string[], validators: BoundedRowValidators): BoundedPublicRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !SAFE_ID.test(row.id)) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  for (const field of validators.stringFields ?? []) {
    if (!select.includes(field)) continue;
    const fieldValue = row[field];
    if (fieldValue !== null && typeof fieldValue !== 'string') throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    if (typeof fieldValue === 'string' && (field === 'id' || field.endsWith('_id')) && !SAFE_ID.test(fieldValue)) {
      throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    }
  }
  for (const field of validators.numberFields ?? []) {
    if (!select.includes(field)) continue;
    const fieldValue = row[field];
    if (fieldValue === null) continue;
    if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  }
  for (const field of validators.booleanFields ?? []) {
    if (!select.includes(field)) continue;
    if (row[field] !== null && typeof row[field] !== 'boolean') throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  }
  for (const field of validators.requiredFields ?? []) {
    if (!select.includes(field)) continue;
    const fieldValue = row[field];
    if (fieldValue === null || fieldValue === undefined) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    if (typeof fieldValue === 'string' && !fieldValue.trim()) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  }
  // Projection tường minh cũng loại mọi cột upstream không nằm trong allowlist,
  // nên cột private không thể đi tiếp vào aggregate/tin công khai.
  return Object.fromEntries(select.map(field => [field, row[field]])) as BoundedPublicRow;
}

/**
 * Đọc hoàn chỉnh, có giới hạn, ẩn danh. Count của mỗi truy vấn keyset là số row còn
 * lại sau cursor, không phải tổng ban đầu. Mọi lệch count đều fail closed. Probe cuối
 * phát hiện tổng thay đổi sau cursor (insert/delete) và bắt buộc trả về cửa sổ đầy đủ
 * chứ KHÔNG phải prefix bị cắt.
 */
export async function readBoundedPublicRows(options: BoundedRowsOptions): Promise<BoundedPublicRow[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const pageSize = bounded(options.pageSize, BOUNDED_ROW_PAGE_SIZE, BOUNDED_ROW_PAGE_SIZE);
    const maxRows = bounded(options.maxRows, BOUNDED_ROW_MAX_ROWS, BOUNDED_ROW_MAX_ROWS);
    const maxPages = bounded(options.maxPages, BOUNDED_ROW_MAX_PAGES, BOUNDED_ROW_MAX_PAGES);
    const timeoutMs = bounded(options.timeoutMs, BOUNDED_ROW_TIMEOUT_MS, BOUNDED_ROW_TIMEOUT_MS);
    const select = options.select.split(',').map(field => field.trim()).filter(Boolean);
    if (select.length === 0 || !select.includes('id')) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    const url = options.url ?? (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    const anonKey = options.anonKey ?? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    if (!url || !anonKey) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    if (!SAFE_TABLE.test(options.table)) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    const filters = Object.entries(options.filters ?? {});
    for (const [key, value] of filters) {
      if (!SAFE_FILTER_KEY.test(key) || typeof value !== 'string' || !value) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    }
    const endpoint = new URL(`${url.replace(/\/$/, '')}/rest/v1/${options.table}`);
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error(BOUNDED_ROWS_UNAVAILABLE);
    }
    const fetcher = options.fetcher ?? fetch;
    const readPage = async (cursor: string | null, limit: number) => {
      if (controller.signal.aborted) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      const requestUrl = new URL(endpoint);
      requestUrl.searchParams.set('select', select.join(','));
      for (const [key, value] of filters) requestUrl.searchParams.set(key, value);
      requestUrl.searchParams.set('order', 'id.asc');
      requestUrl.searchParams.set('limit', String(limit));
      if (cursor) requestUrl.searchParams.set('id', `gt.${cursor}`);
      const response = await fetcher(requestUrl.toString(), {
        method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Prefer: 'count=exact' },
      });
      if (!response.ok) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      const range = response.headers.get('content-range')?.match(/^(\*|0-(\d+))\/(\d+)$/);
      if (!range) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      const count = Number(range[3]);
      if (!Number.isSafeInteger(count) || count > maxRows) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      const body: unknown = await response.json();
      if (!Array.isArray(body) || body.length > limit || body.length > count) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      if (body.length === 0 ? range[1] !== '*' : Number(range[2]) !== body.length - 1) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      const rows = body.map(value => validateRow(value, select, options.validators));
      return { count, rows };
    };

    const readComplete = async () => {
      const rows: BoundedPublicRow[] = [];
      let total: number | undefined;
      let cursor: string | null = null;
      let pages = 0;
      do {
        if (++pages > maxPages || controller.signal.aborted) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
        const pageResult = await readPage(cursor, Math.min(pageSize, maxRows - rows.length));
        total ??= pageResult.count;
        if (pageResult.count !== total - rows.length || (pageResult.rows.length === 0 && rows.length !== total)) {
          throw new Error(BOUNDED_ROWS_UNAVAILABLE);
        }
        for (const row of pageResult.rows) {
          if (cursor !== null && row.id <= cursor) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
          cursor = row.id;
          rows.push(row);
        }
      } while (rows.length < total);
      const verification = await readPage(null, 1);
      if (verification.count !== total || verification.rows.length !== Math.min(1, total)
        || verification.rows[0]?.id !== rows[0]?.id) throw new Error(BOUNDED_ROWS_UNAVAILABLE);
      return rows;
    };

    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(BOUNDED_ROWS_UNAVAILABLE));
      }, timeoutMs);
    });
    return await Promise.race([readComplete(), deadline]);
  } catch {
    controller.abort();
    throw new Error(BOUNDED_ROWS_UNAVAILABLE);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
