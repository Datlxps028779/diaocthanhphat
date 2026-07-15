import { describe, it, expect } from 'vitest';
import {
  POI_CATEGORIES,
  buildOverpassQuery,
  haversineMeters,
  parseOverpassResponse,
  categoryLabel,
} from './poi';

describe('haversineMeters', () => {
  it('cùng điểm → 0', () => {
    expect(haversineMeters({ lat: 10.9, lng: 106.6 }, { lat: 10.9, lng: 106.6 })).toBe(0);
  });

  it('khoảng cách ~1 độ vĩ tuyến ≈ 111km', () => {
    const d = haversineMeters({ lat: 10, lng: 106 }, { lat: 11, lng: 106 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('buildOverpassQuery', () => {
  const q = buildOverpassQuery(10.9, 106.6, 1500);

  it('bao quanh bán kính + tọa độ', () => {
    expect(q).toContain('around:1500,10.9,106.6');
  });

  it('có định dạng json + timeout', () => {
    expect(q).toContain('[out:json]');
    expect(q).toMatch(/timeout:\d+/);
  });

  it('chứa các tag OSM của mọi nhóm (dạng Overpass "k"="v")', () => {
    for (const cat of POI_CATEGORIES) {
      for (const t of cat.osm) {
        const [k, v] = t.split('=');
        expect(q).toContain(`"${k}"="${v}"`);
      }
    }
  });

  it('kết thúc bằng out center', () => {
    expect(q).toContain('out center');
  });
});

describe('parseOverpassResponse', () => {
  const origin = { lat: 10.900, lng: 106.600 };
  const sample = {
    elements: [
      { type: 'node', lat: 10.901, lon: 106.601, tags: { amenity: 'school', name: 'Trường A' } },
      { type: 'node', lat: 10.9005, lon: 106.6005, tags: { amenity: 'hospital', name: 'BV B' } },
      { type: 'way', center: { lat: 10.902, lon: 106.602 }, tags: { shop: 'supermarket', name: 'Siêu thị C' } },
      { type: 'node', lat: 10.95, lon: 106.65, tags: { amenity: 'school' } }, // không tên → bỏ
      { type: 'node', lat: 10.9, lon: 106.6, tags: { amenity: 'toilets', name: 'WC' } }, // không thuộc nhóm → bỏ
    ],
  };

  it('bỏ phần tử không tên và không thuộc nhóm nào', () => {
    const pois = parseOverpassResponse(sample, origin);
    const names = pois.map(p => p.name);
    expect(names).toContain('Trường A');
    expect(names).toContain('BV B');
    expect(names).toContain('Siêu thị C');
    expect(names).not.toContain('WC');
    expect(pois).toHaveLength(3);
  });

  it('gán category đúng theo tag', () => {
    const pois = parseOverpassResponse(sample, origin);
    expect(pois.find(p => p.name === 'Trường A')?.category).toBe('school');
    expect(pois.find(p => p.name === 'BV B')?.category).toBe('hospital');
    expect(pois.find(p => p.name === 'Siêu thị C')?.category).toBe('market');
  });

  it('tính khoảng cách và sort tăng dần', () => {
    const pois = parseOverpassResponse(sample, origin);
    for (const p of pois) expect(p.distanceMeters).toBeGreaterThanOrEqual(0);
    const dists = pois.map(p => p.distanceMeters);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);
  });

  it('elements rỗng/thiếu → mảng rỗng', () => {
    expect(parseOverpassResponse({}, origin)).toEqual([]);
    expect(parseOverpassResponse({ elements: [] }, origin)).toEqual([]);
  });

  it('cap số lượng mỗi nhóm', () => {
    const many = { elements: Array.from({ length: 20 }, (_, i) => ({
      type: 'node', lat: 10.9 + i * 0.001, lon: 106.6, tags: { amenity: 'school', name: `T${i}` },
    })) };
    const pois = parseOverpassResponse(many, origin);
    expect(pois.filter(p => p.category === 'school').length).toBeLessThanOrEqual(5);
  });
});

describe('categoryLabel', () => {
  it('trả nhãn tiếng Việt cho mọi nhóm', () => {
    for (const cat of POI_CATEGORIES) {
      expect(categoryLabel(cat.key).length).toBeGreaterThan(0);
    }
  });
});
