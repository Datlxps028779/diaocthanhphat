import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { geoJsonCoversPoint } from './taxonomyPoint';

const seed = readFileSync(
  resolve(process.cwd(), 'supabase/manual_taxonomy_geo_kontur_seed.sql'),
  'utf8',
);

const polygonSql = readdirSync(resolve(process.cwd(), 'supabase'))
  .filter(file => file.startsWith('manual_taxonomy_geo_polygon_') && file.endsWith('.sql'))
  .map(file => readFileSync(resolve(process.cwd(), 'supabase', file), 'utf8'))
  .join('\n');

const reviewedRows = [...seed.matchAll(
  /\('(area|district|ward)', '([0-9a-f-]+)', '\{"south": (-?[0-9.]+), "west": (-?[0-9.]+), "north": (-?[0-9.]+), "east": (-?[0-9.]+)\}'::jsonb, (-?[0-9.]+), (-?[0-9.]+)/g,
)].map(match => ({
  level: match[1],
  id: match[2],
  bounds: { south: Number(match[3]), west: Number(match[4]), north: Number(match[5]), east: Number(match[6]) },
  center: { lat: Number(match[7]), lng: Number(match[8]) },
}));

const polygons = new Map(
  [...polygonSql.matchAll(/\('(area|district|ward)', '([0-9a-f-]+)'::uuid, \$geo\$(\{"type":[\s\S]*?\})\$geo\$::jsonb\)/g)]
    .map(match => [`${match[1]}:${match[2]}`, JSON.parse(match[3])]),
);

function positions(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [[value[0], value[1]]];
  }
  return value.flatMap(positions);
}

describe('reviewed taxonomy polygon seed', () => {
  it('keeps one exact polygon for every one of the 702 reviewed mappings', () => {
    expect(reviewedRows).toHaveLength(702);
    expect(polygons.size).toBe(702);
    for (const row of reviewedRows) {
      expect(polygons.has(`${row.level}:${row.id}`), `${row.level}:${row.id}`).toBe(true);
    }
  });

  it('preserves the reviewed bounds and accepts a boundary point for every mapped entity', () => {
    for (const row of reviewedRows) {
      const polygon = polygons.get(`${row.level}:${row.id}`) as { coordinates?: unknown };
      const points = positions(polygon?.coordinates);
      expect(points.length, `${row.level}:${row.id}`).toBeGreaterThan(0);
      const lngs = points.map(point => point[0]);
      const lats = points.map(point => point[1]);
      expect(Math.min(...lats)).toBeCloseTo(row.bounds.south, 6);
      expect(Math.min(...lngs)).toBeCloseTo(row.bounds.west, 6);
      expect(Math.max(...lats)).toBeCloseTo(row.bounds.north, 6);
      expect(Math.max(...lngs)).toBeCloseTo(row.bounds.east, 6);
      expect(geoJsonCoversPoint(polygon, { lat: points[0][1], lng: points[0][0] }), `${row.level}:${row.id}`).toBe(true);
    }
  });

  it('rejects the reported Lái Thiêu point for Bình Dương → Thuận An → An Phú', () => {
    const anPhuPolygon = polygons.get('ward:f6a19857-85b6-47df-99be-dc78fb4a3742');
    expect(geoJsonCoversPoint(anPhuPolygon, { lat: 10.895430, lng: 106.695699 })).toBe(false);
  });
});
