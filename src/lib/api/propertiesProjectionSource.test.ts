import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/lib/api/properties.ts'), 'utf8');

function functionBody(signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} should exist`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport ', start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('property projection reader boundary', () => {
  it('uses the public projection for public property readers', () => {
    for (const signature of [
      'function buildPropertyQuery(',
      'export async function getPublicPropertiesByIds(',
      'export async function getAllPropertiesForMap(',
      'export async function getComps(',
      'export async function getPropertyOptions(',
      'export async function getFeaturedProperties(',
      'export async function getHotProperties(',
      'export async function getRecentProperties(',
      'export async function getPropertyById(',
      'export async function getPropertyByIdOrSlug(',
      'export async function getRelatedProperties(',
    ]) {
      expect(functionBody(signature), signature).toContain(".from('public_properties')");
    }
    expect(source).toContain(".select(PUBLIC_PROPERTY_SELECT, { count: 'exact' })");
    expect(source).toContain(".from('public_properties')\n    .select(ADVISOR_PROPERTY_SELECT)");
  });

  it('reads the map through the shared public projection, not a minimal string', () => {
    const body = functionBody('export async function getAllPropertiesForMap(');
    // Popup bản đồ dựng thẻ bằng buildPropertyCardModel, nên query phải mang đủ field
    // (slug/public_code/created_at/bathrooms/images/address + join taxonomy). Dùng chính
    // PUBLIC_PROPERTY_SELECT để không lệch với các reader khác.
    expect(body).toContain('PUBLIC_PROPERTY_SELECT');
    // Bộ lọc bản đồ chạy trên hai cột này nên projection phải giữ chúng.
    expect(body).toContain(".not('latitude', 'is', null)");
    expect(body).toContain(".not('longitude', 'is', null)");
    // Không quay lại chuỗi cột tối thiểu tự viết.
    expect(body).not.toMatch(/\.select\('id, title, price/);

    const publicSelect = source.match(/export const PUBLIC_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    for (const column of ['latitude', 'longitude', 'slug', 'public_code', 'created_at', 'bathrooms', 'images', 'address', 'areas(id,name,slug)', 'property_types(id,name,slug)']) {
      expect(publicSelect, `PUBLIC_PROPERTY_SELECT must include ${column}`).toContain(column);
    }
    expect(publicSelect).not.toMatch(/contact_(?:name|phone|zalo)/);
  });

  it('keeps admin reads and writers on the base properties table', () => {
    for (const signature of [
      'export function buildAdminPropertyQuery(',
      'export async function adminGetAllProperties(',
      'export async function createProperty(',
      'export async function updateProperty(',
      'export async function deleteProperty(',
      'export async function bulkUpdateProperties(',
      'export async function bulkDeleteProperties(',
    ]) {
      expect(functionBody(signature), signature).toContain(".from('properties')");
    }
  });

  it('does not put contact fields in the public select constants', () => {
    const publicSelect = source.match(/export const PUBLIC_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    const advisorSelect = source.match(/export const ADVISOR_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    expect(publicSelect).not.toMatch(/contact_(?:name|phone|zalo)/);
    expect(advisorSelect).not.toMatch(/contact_(?:name|phone|zalo)/);
  });
});

/**
 * Vùng đệm chống hồi quy cho projection của AI Advisor. Thẻ card trong AiSearchChat
 * đọc thẳng `res.data` (Property thô) từ `ADVISOR_PROPERTY_SELECT`, nên field nào
 * KHÔNG được select thì card không thể hiển thị — kể cả khi model/thành phần đã sẵn
 * sàng. Vì vậy phải khẳng định TƯỜNG MINH từng field có mặt, thay vì chỉ kiểm tra
 * "không có field riêng tư".
 */
const advisorSelectSource = source.match(/export const ADVISOR_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
const advisorSelectColumns = advisorSelectSource
  .split(',')
  .map(column => column.trim())
  .filter(Boolean);

/** Cột phẳng (bỏ cột lồng `areas(...)`/`property_types(...)`). */
const advisorFlatColumns = advisorSelectColumns.filter(column => !column.includes('('));

/** Các cột mà `buildPropertyCardModel` cần để dựng ĐỦ thông tin thẻ card. */
const CARD_MODEL_COLUMNS = [
  'id',
  'title',
  'listing_type',
  'price',
  'price_unit',
  'price_label',
  'price_per_month',
  'area_sqm',
  'bedrooms',
  'bathrooms',
  'legal_status',
  'address',
  'city',
  'district',
  'ward',
  'images',
  'created_at',
  'slug',
];

describe('advisor property projection covers the shared card model', () => {
  it('parses the advisor select into columns', () => {
    expect(advisorSelectSource.length, 'ADVISOR_PROPERTY_SELECT should exist').toBeGreaterThan(0);
    expect(advisorFlatColumns.length).toBe(advisorSelectColumns.length - 2);
  });

  it('selects every allowlisted column the card model needs', () => {
    for (const column of CARD_MODEL_COLUMNS) {
      expect(advisorFlatColumns, `ADVISOR_PROPERTY_SELECT must include ${column}`).toContain(column);
    }
  });

  it('embeds the taxonomy joins the card model reads', () => {
    expect(advisorSelectSource).toContain('areas(id,name,slug)');
    expect(advisorSelectSource).toContain('property_types(id,name,slug)');
  });

  it('keeps every selected flat column inside the public projection', () => {
    const publicSelect = source.match(/export const PUBLIC_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    const publicColumns = new Set(
      publicSelect
        .split(',')
        .map(column => column.trim())
        .filter(column => column && !column.includes('(')),
    );
    for (const column of advisorFlatColumns) {
      expect(publicColumns, `${column} must also be public`).toContain(column);
    }
  });

  it('selects no private advisor field', () => {
    const privateBlock = source.match(/export const ADVISOR_PRIVATE_PROPERTY_FIELDS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
    const privateFields = [...privateBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(privateFields.length).toBeGreaterThan(0);
    for (const field of privateFields) {
      expect(advisorFlatColumns, `ADVISOR_PROPERTY_SELECT must not include ${field}`).not.toContain(field);
    }
  });

  it('exposes no raw column the public projection already withholds', () => {
    for (const column of advisorFlatColumns) {
      expect(column).not.toMatch(/^contact_(?:name|phone|zalo)$/);
      expect(column).not.toMatch(/^schema_markup$/);
    }
  });
});
