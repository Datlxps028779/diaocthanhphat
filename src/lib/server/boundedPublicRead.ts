// Wrapper CỐ ĐỊNH cho public_properties: is_active + projection thống kê trang chủ.
// Toàn bộ transport (anonymous GET, keyset, count, probe cuối, deadline, fail closed)
// nằm ở boundedPublicRows.ts để bảng khác dùng lại mà không nhân bản logic.
//
// API công khai của file này giữ nguyên: BOUNDED_READ_* , BoundedReadOptions,
// BoundedReadRow và readPublishedPropertyRows() — loader thống kê trang chủ và
// snapshot địa phương phụ thuộc trực tiếp.
import type { HomeLocationPropertyRow } from '../homeLocationStats';
import {
  BOUNDED_ROW_MAX_PAGES, BOUNDED_ROW_MAX_ROWS, BOUNDED_ROW_PAGE_SIZE, BOUNDED_ROW_TIMEOUT_MS,
  readBoundedPublicRows, type BoundedRowValidators,
} from './boundedPublicRows';

export const BOUNDED_READ_UNAVAILABLE = 'Location statistics unavailable';
export const BOUNDED_READ_MAX_ROWS = BOUNDED_ROW_MAX_ROWS;
export const BOUNDED_READ_MAX_PAGES = BOUNDED_ROW_MAX_PAGES;
export const BOUNDED_READ_PAGE_SIZE = BOUNDED_ROW_PAGE_SIZE;
export const BOUNDED_READ_TIMEOUT_MS = BOUNDED_ROW_TIMEOUT_MS;

export type BoundedReadOptions = {
  fetcher?: typeof fetch;
  url?: string;
  anonKey?: string;
  pageSize?: number;
  maxRows?: number;
  maxPages?: number;
  timeoutMs?: number;
  /** Cột PostgREST cần lấy; mặc định là projection thống kê trang chủ. */
  select?: string;
  /** Bảng REST cần đọc; mặc định public_properties. */
  table?: string;
  /** Additional PostgREST filters applied alongside is_active=eq.true. */
  filters?: Record<string, string>;
};

export type BoundedReadRow = HomeLocationPropertyRow & {
  ward_id: string | null;
  property_type_id: string | null;
  title: string | null;
};

const PROPERTY_SELECT = 'id,area_id,district_id,listing_type,price,price_unit,price_per_month,area_sqm';

// Allowlist cột của wrapper này. Cột `*_id` và title được kiểm tra kiểu chuỗi;
// numberFields bảo đảm số hữu hạn trước khi tổng hợp giá.
const PROPERTY_VALIDATORS: BoundedRowValidators = {
  stringFields: ['area_id', 'district_id', 'ward_id', 'listing_type', 'price_unit', 'property_type_id', 'title'],
  numberFields: ['price', 'price_per_month', 'area_sqm'],
};

/**
 * Đọc hoàn chỉnh, có giới hạn, ẩn danh public_properties đang active. Shape trả về
 * được cố định theo BoundedReadRow để loader tổng hợp không thấy cột nào khác.
 */
export async function readPublishedPropertyRows(options: BoundedReadOptions = {}): Promise<BoundedReadRow[]> {
  const select = (options.select ?? PROPERTY_SELECT).split(',').map(field => field.trim()).filter(Boolean);
  try {
    const rows = await readBoundedPublicRows({
      fetcher: options.fetcher,
      url: options.url,
      anonKey: options.anonKey,
      pageSize: options.pageSize,
      maxRows: options.maxRows,
      maxPages: options.maxPages,
      timeoutMs: options.timeoutMs,
      table: options.table ?? 'public_properties',
      select: select.join(','),
      filters: { ...(options.filters ?? {}), is_active: 'eq.true' },
      validators: PROPERTY_VALIDATORS,
    });
    // Cột ngoài projection của wrapper không bao giờ được trả ra: shape cố định.
    return rows.map(row => ({
      id: row.id,
      title: select.includes('title') ? (row.title as string | null) : null,
      area_id: (row.area_id ?? null) as string | null,
      district_id: (row.district_id ?? null) as string | null,
      ward_id: select.includes('ward_id') ? ((row.ward_id ?? null) as string | null) : null,
      property_type_id: select.includes('property_type_id') ? ((row.property_type_id ?? null) as string | null) : null,
      listing_type: (row.listing_type ?? null) as string | null,
      price: (row.price ?? null) as number | null,
      price_unit: (row.price_unit ?? null) as string | null,
      price_per_month: (row.price_per_month ?? null) as number | null,
      area_sqm: (row.area_sqm ?? null) as number | null,
    }));
  } catch {
    // Thông điệp riêng của wrapper property — không đổi vì loader/route phụ thuộc.
    throw new Error(BOUNDED_READ_UNAVAILABLE);
  }
}
