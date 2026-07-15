import { buildOverpassQuery, parseOverpassResponse, type NearbyPoi } from '../poi';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const RADIUS_METERS = 1500;
const TIMEOUT_MS = 15000;

const cache = new Map<string, NearbyPoi[]>();
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export async function fetchNearbyPoi(lat: number, lng: number): Promise<NearbyPoi[]> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const query = buildOverpassQuery(lat, lng, RADIUS_METERS);
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: query,
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    const pois = parseOverpassResponse(json, { lat, lng });
    cache.set(key, pois);
    return pois;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
