export type PoiCategoryKey = 'school' | 'market' | 'hospital' | 'bank' | 'park';

export interface PoiCategory {
  key: PoiCategoryKey;
  label: string;
  osm: string[];
}

export const POI_CATEGORIES: PoiCategory[] = [
  { key: 'school', label: 'Trường học', osm: ['amenity=school', 'amenity=kindergarten'] },
  { key: 'market', label: 'Chợ & siêu thị', osm: ['shop=supermarket', 'amenity=marketplace'] },
  { key: 'hospital', label: 'Y tế', osm: ['amenity=hospital', 'amenity=clinic'] },
  { key: 'bank', label: 'Ngân hàng', osm: ['amenity=bank'] },
  { key: 'park', label: 'Công viên', osm: ['leisure=park'] },
];

const PER_CATEGORY_CAP = 5;

export interface NearbyPoi {
  name: string;
  category: PoiCategoryKey;
  distanceMeters: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function categoryLabel(key: PoiCategoryKey): string {
  return POI_CATEGORIES.find(c => c.key === key)?.label ?? key;
}

// Overpass QL: với mỗi tag của mỗi nhóm sinh 1 dòng node/way around bán kính.
export function buildOverpassQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `around:${radiusMeters},${lat},${lng}`;
  const lines: string[] = [];
  for (const cat of POI_CATEGORIES) {
    for (const tag of cat.osm) {
      const [k, v] = tag.split('=');
      lines.push(`  node["${k}"="${v}"](${around});`);
      lines.push(`  way["${k}"="${v}"](${around});`);
    }
  }
  return `[out:json][timeout:20];\n(\n${lines.join('\n')}\n);\nout center;`;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

interface OverpassElement {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function matchCategory(tags: Record<string, string>): PoiCategoryKey | null {
  for (const cat of POI_CATEGORIES) {
    for (const expr of cat.osm) {
      const [k, v] = expr.split('=');
      if (tags[k] === v) return cat.key;
    }
  }
  return null;
}

export function parseOverpassResponse(json: unknown, origin: LatLng): NearbyPoi[] {
  const elements = (json as { elements?: OverpassElement[] })?.elements;
  if (!Array.isArray(elements)) return [];

  const pois: NearbyPoi[] = [];
  for (const el of elements) {
    const tags = el.tags;
    const name = tags?.name?.trim();
    if (!name) continue;
    const category = tags ? matchCategory(tags) : null;
    if (!category) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    pois.push({ name, category, distanceMeters: haversineMeters(origin, { lat, lng: lon }) });
  }

  pois.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Cap mỗi nhóm để tránh danh sách dài lê thê (giữ những cái gần nhất do đã sort).
  const counts = new Map<PoiCategoryKey, number>();
  const capped: NearbyPoi[] = [];
  for (const p of pois) {
    const n = counts.get(p.category) ?? 0;
    if (n >= PER_CATEGORY_CAP) continue;
    counts.set(p.category, n + 1);
    capped.push(p);
  }
  return capped;
}
