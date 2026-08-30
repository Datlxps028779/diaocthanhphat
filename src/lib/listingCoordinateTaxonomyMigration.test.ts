import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const foundation = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260914000000_listing_coordinate_taxonomy_foundation.sql'),
  'utf8',
);
const enforcement = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260914010000_listing_coordinate_taxonomy_enforcement.sql'),
  'utf8',
);
const migration = `${foundation}\n${enforcement}`;

const repair = readFileSync(
  resolve(process.cwd(), 'supabase/manual_listing_coordinate_taxonomy_repair.sql'),
  'utf8',
);
const verification = readFileSync(
  resolve(process.cwd(), 'supabase/manual_listing_coordinate_taxonomy_verify.sql'),
  'utf8',
);

const polygonFiles = readdirSync(resolve(process.cwd(), 'supabase'))
  .filter(file => file.startsWith('manual_taxonomy_geo_polygon_') && file.endsWith('.sql') && !file.includes('_part_'))
  .map(file => readFileSync(resolve(process.cwd(), 'supabase', file), 'utf8'));

const transportPartNames = readdirSync(resolve(process.cwd(), 'supabase'))
  .filter(file => file.startsWith('manual_taxonomy_geo_polygon_') && file.includes('_part_') && file.endsWith('.sql'))
  .sort();
const transportParts = transportPartNames
  .map(file => readFileSync(resolve(process.cwd(), 'supabase', file), 'utf8'));

function polygonRows(sql: string): Map<string, string> {
  return new Map([...sql.matchAll(/\('(area|district|ward)', '([0-9a-f-]+)'::uuid, \$geo\$(\{"type":[\s\S]*?\})\$geo\$::jsonb\)/g)]
    .map(match => [`${match[1]}:${match[2]}`, match[3]]));
}

describe('listing coordinate taxonomy migration', () => {
  it('stores exact ward identity on pending and public listings', () => {
    expect(migration).toMatch(/ALTER TABLE public\.user_listings[\s\S]+ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES public\.wards\(id\) ON DELETE RESTRICT/);
    expect(migration).toMatch(/ALTER TABLE public\.properties[\s\S]+ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES public\.wards\(id\) ON DELETE RESTRICT/);
    expect(migration).toContain('ward_id = v_listing.ward_id');
    expect(migration).toContain('district_id, ward_id, district, ward');
  });

  it('fails closed on missing polygons and coordinates outside the selected ward', () => {
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions');
    expect(migration).toContain('ST_Covers(');
    expect(migration).toContain("public.taxonomy_geo_covers_point('ward', NEW.ward_id, NEW.latitude, NEW.longitude)");
    expect(migration).toContain('Xã/phường đã chọn chưa có polygon xác minh; không được lưu tọa độ ước lượng.');
    expect(migration).toContain('Tọa độ nằm ngoài ranh giới xã/phường đã chọn.');
  });

  it('protects helper ACLs and runs validation in a fixed search path', () => {
    expect(migration).toContain('SECURITY DEFINER\nSET search_path = public, extensions, pg_temp');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.taxonomy_geo_covers_point\([\s\S]+FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF area_id, district_id, ward_id, district, ward, neighborhood_slug, latitude, longitude/);
  });

  it('fails closed before enforcement when historical coordinates remain invalid', () => {
    expect(foundation).toContain('ALTER TABLE public.wards ALTER COLUMN district_id SET NOT NULL');
    expect(enforcement).toMatch(/UPDATE public\.user_listings listing[\s\S]+listing\.ward_id IS NULL[\s\S]+taxonomy_geo_covers_point\('ward', ward\.id, listing\.latitude, listing\.longitude\)/);
    expect(enforcement).toMatch(/UPDATE public\.properties property[\s\S]+property\.ward_id IS NULL[\s\S]+taxonomy_geo_covers_point\('ward', ward\.id, property\.latitude, property\.longitude\)/);
    expect(enforcement).toContain("NOT public.taxonomy_geo_covers_point('ward', row.ward_id, row.latitude, row.longitude)");
    expect(enforcement).toContain('Không thể bật coordinate enforcement');
    expect(enforcement.indexOf('Không thể bật coordinate enforcement')).toBeLessThan(enforcement.indexOf('CREATE OR REPLACE FUNCTION public.validate_listing_location_integrity()'));
  });

  it('repairs and verifies incomplete pairs in either direction', () => {
    expect(repair).toContain('v_property_rows <> 10 OR v_listing_rows <> 5');
    for (const sql of [repair, verification]) {
      expect(sql).toMatch(/\(listing\.latitude IS NOT NULL OR listing\.longitude IS NOT NULL\)[\s\S]+listing\.latitude IS NULL[\s\S]+listing\.longitude IS NULL/);
      expect(sql).toMatch(/\(property\.latitude IS NOT NULL OR property\.longitude IS NOT NULL\)[\s\S]+property\.latitude IS NULL[\s\S]+property\.longitude IS NULL/);
    }
  });

  it('provides transport-safe chunks without changing Bình Phước or Đồng Nai geometry', () => {
    expect(transportPartNames).toHaveLength(7);
    for (const part of transportParts) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(2_000_000);

    const largeSource = polygonFiles.filter(sql => sql.includes('Tỉnh Bình Phước') || sql.includes('Tỉnh Đồng Nai')).join('\n');
    const sourceRows = [...polygonRows(largeSource).entries()].sort(([left], [right]) => left.localeCompare(right));
    const partRows = [...polygonRows(transportParts.join('\n')).entries()].sort(([left], [right]) => left.localeCompare(right));
    expect(partRows).toEqual(sourceRows);
  });

  it('ships all 702 previously reviewed source polygons without rematching names', () => {
    expect(polygonFiles).toHaveLength(4);
    const combined = polygonFiles.join('\n');
    expect((combined.match(/\$geo\$::jsonb/g) ?? [])).toHaveLength(702);
    expect(combined).toContain("target.source = 'Kontur Boundaries Vietnam 20230628'");
    expect(combined).toContain("target.administrative_vintage = 'legacy_pre_merger'");
  });
});
