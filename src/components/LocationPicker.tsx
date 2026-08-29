'use client';
import { useEffect, useRef, useState } from 'react';
import { isValidTaxonomyBounds, type TaxonomyBounds } from '../lib/taxonomyGeo';

export type TaxonomyLevel = 'area' | 'district' | 'ward';

export type TaxonomyScope = {
  level: TaxonomyLevel;
  areaName: string;
  districtName?: string;
  wardName?: string;
};

export interface GeocodeTarget {
  query: string;
  zoom: number;
  nonce: number;
  intent: 'taxonomy' | 'address';
  taxonomyScope?: TaxonomyScope;
  bounds?: TaxonomyBounds;
  geojson?: Record<string, unknown>;
  taxonomyLabel?: string;
}

interface LocationPickerProps {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  geocodeTarget?: GeocodeTarget;
  onReverseGeocode?: (address: string) => void;
  height?: string;
}

type MapStatus = 'idle' | 'searching' | 'candidate' | 'placed' | 'review' | 'missing_geo' | 'none' | 'error';
type Candidate = { lat: number; lng: number; label: string };
type GeocodeResult = { lat: number; lng: number; label: string };

type NominatimSearchResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string>;
  boundingbox?: string[];
};
type PhotonFeature = { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown>; bbox?: number[] };
type PhotonResponse = { features?: PhotonFeature[] };
type ArcGisCandidate = { address?: string; score?: number; location?: { x?: number; y?: number }; extent?: { xmin?: number; ymin?: number; xmax?: number; ymax?: number } };
type ArcGisResponse = { candidates?: ArcGisCandidate[] };

const PIN_SVG = `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;
const CANDIDATE_PIN_SVG = `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#d97706"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;

function shortAddress(data: { address?: Record<string, string>; display_name?: string }): string {
  const a = data.address;
  if (a) {
    const parts = [
      [a.house_number, a.road].filter(Boolean).join(' '),
      a.suburb || a.village || a.hamlet || a.quarter,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  return data.display_name?.split(',').slice(0, 2).join(',').trim() ?? '';
}

function coordinate(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeoutController = new AbortController();
  const abort = () => timeoutController.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(), 8000);
  try {
    const response = await fetch(url, { signal: timeoutController.signal });
    if (!response.ok) throw new Error(`Geocoder ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export type GeocoderCandidate = {
  lat: number;
  lng: number;
  label: string;
  score: number;
  areaName?: string;
  districtName?: string;
  wardName?: string;
  bounds?: TaxonomyBounds;
};

function photonLabel(properties: Record<string, unknown>): string {
  return [properties.housenumber, properties.street, properties.name, properties.locality, properties.district, properties.city, properties.state]
    .filter(value => typeof value === 'string' && value.trim())
    .join(', ');
}

function parseBounds(values: unknown): TaxonomyBounds | undefined {
  if (!Array.isArray(values) || values.length < 4) return undefined;
  const numbers = values.map(value => Number(value));
  const [south, north, west, east] = numbers;
  const bounds = { south, west, north, east };
  return isValidTaxonomyBounds(bounds) ? bounds : undefined;
}

function photonResult(feature: PhotonFeature | undefined): GeocoderCandidate | null {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = typeof coordinates[0] === 'number' ? coordinates[0] : Number(coordinates[0]);
  const lat = typeof coordinates[1] === 'number' ? coordinates[1] : Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const properties = feature?.properties ?? {};
  const label = photonLabel(properties) || 'Điểm tìm thấy gần đúng';
  return {
    lat,
    lng,
    label,
    score: 0,
    areaName: typeof properties.state === 'string' ? properties.state : undefined,
    districtName: typeof properties.district === 'string' ? properties.district : undefined,
    wardName: typeof properties.name === 'string' ? properties.name : undefined,
    bounds: parseBounds(feature?.bbox),
  };
}

function normalizeSearchPart(value: string): string {
  let result = value.trim().toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'đ');
  result = result.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  result = result.replace(/đac lua/gu, 'đak lua');
  const prefixes = /^(tinh|thanh pho|tp|huyen|quan|thi xa|thi tran|phuong|xa)\s+/u;
  while (prefixes.test(result)) result = result.replace(prefixes, '').trim();
  return result;
}

function normalizedPhrase(value: string): string[] {
  return normalizeSearchPart(value).split(/\s+/).filter(Boolean);
}

function containsPlacePhrase(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const actualTokens = normalizedPhrase(actual);
  const expectedTokens = normalizedPhrase(expected);
  if (actualTokens.length === 0 || expectedTokens.length === 0 || actualTokens.length < expectedTokens.length) return false;
  return actualTokens.some((_, start) => expectedTokens.every((token, index) => actualTokens[start + index] === token));
}

function samePlaceName(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const a = normalizedPhrase(actual);
  const e = normalizedPhrase(expected);
  return a.length === e.length && a.every((token, index) => token === e[index]);
}

function labelContainsPlace(label: string, expected: string | undefined): boolean {
  return containsPlacePhrase(label, expected);
}

function pointInBounds(candidate: Pick<GeocoderCandidate, 'lat' | 'lng'>, bounds: TaxonomyBounds | undefined): boolean {
  return Boolean(bounds && candidate.lat >= bounds.south && candidate.lat <= bounds.north && candidate.lng >= bounds.west && candidate.lng <= bounds.east);
}

export function taxonomyQueryVariants(scope: TaxonomyScope): string[] {
  const selectedName = scope.level === 'ward' ? scope.wardName : scope.level === 'district' ? scope.districtName : scope.areaName;
  if (!selectedName) return [];
  const prefixes = scope.level === 'ward'
    ? ['Phường', 'Xã', 'Thị trấn']
    : scope.level === 'district'
      ? ['Huyện', 'Quận', 'Thị xã', 'Thành phố']
      : ['Tỉnh', 'Thành phố'];
  const parent = [
    scope.level === 'ward' ? scope.districtName : undefined,
    scope.areaName,
  ].filter(Boolean).join(', ');
  return [...new Set([
    ...prefixes.map(prefix => `${prefix} ${selectedName}${parent ? `, ${parent}` : ''}`),
    `${selectedName}${parent ? `, ${parent}` : ''}`,
  ])];
}

export function candidateMatchesTaxonomy(candidate: GeocoderCandidate, scope: TaxonomyScope, parentBounds?: TaxonomyBounds): boolean {
  const selectedName = scope.level === 'ward' ? scope.wardName : scope.level === 'district' ? scope.districtName : scope.areaName;
  const selectedMatches = samePlaceName(
    scope.level === 'area' ? candidate.areaName : scope.level === 'district' ? candidate.districtName : candidate.wardName,
    selectedName,
  ) || labelContainsPlace(candidate.label, selectedName);
  if (!selectedMatches) return false;

  const areaMatches = samePlaceName(candidate.areaName, scope.areaName) || labelContainsPlace(candidate.label, scope.areaName);
  if (candidate.areaName && !areaMatches) return false;
  if (!candidate.areaName && !areaMatches && scope.level !== 'area' && !pointInBounds(candidate, parentBounds)) return false;

  if (scope.level === 'ward' && scope.districtName) {
    const districtMatches = samePlaceName(candidate.districtName, scope.districtName) || labelContainsPlace(candidate.label, scope.districtName);
    if (candidate.districtName && !districtMatches) return false;
    if (!candidate.districtName && !districtMatches && !pointInBounds(candidate, parentBounds)) return false;
  }
  return true;
}

function nominatimCandidate(result: NominatimSearchResult): GeocoderCandidate | null {
  const lat = result.lat ? Number(result.lat) : NaN;
  const lng = result.lon ? Number(result.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = result.address ?? {};
  return {
    lat,
    lng,
    label: result.display_name || 'Điểm tìm thấy gần đúng',
    score: 0,
    areaName: address.state || address.province || address.city,
    districtName: address.county || address.district || address.municipality,
    wardName: address.suburb || address.village || address.town || address.city_district,
    bounds: parseBounds(result.boundingbox),
  };
}

function arcGisCandidate(candidate: ArcGisCandidate): GeocoderCandidate | null {
  const lat = candidate.location?.y;
  const lng = candidate.location?.x;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const extent = candidate.extent;
  const bounds = extent
    ? { south: extent.ymin ?? NaN, west: extent.xmin ?? NaN, north: extent.ymax ?? NaN, east: extent.xmax ?? NaN }
    : undefined;
  return {
    lat: lat as number,
    lng: lng as number,
    label: candidate.address?.trim() || 'Điểm tìm thấy gần đúng',
    score: Number.isFinite(candidate.score) ? candidate.score ?? 0 : 0,
    bounds: bounds && isValidTaxonomyBounds(bounds) ? bounds : undefined,
  };
}

async function searchTaxonomyGeocode(scope: TaxonomyScope, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const parentScope: TaxonomyScope | null = scope.level === 'ward' && scope.districtName
    ? { level: 'district', areaName: scope.areaName, districtName: scope.districtName }
    : scope.level === 'district'
      ? { level: 'area', areaName: scope.areaName }
      : null;
  let parentBounds: TaxonomyBounds | undefined;
  if (parentScope) {
    const parentCandidates = await searchProviderCandidates(parentScope, undefined, signal);
    const parent = parentCandidates
      .filter(candidate => candidateMatchesTaxonomy(candidate, parentScope))
      .sort((a, b) => b.score - a.score)[0];
    parentBounds = parent?.bounds;
  }
  const candidates = await searchProviderCandidates(scope, parentBounds, signal);
  const winner = candidates
    .filter(candidate => candidateMatchesTaxonomy(candidate, scope, parentBounds))
    .sort((a, b) => b.score - a.score)[0];
  return winner ? { lat: winner.lat, lng: winner.lng, label: winner.label } : null;
}

async function searchProviderCandidates(scope: TaxonomyScope, parentBounds?: TaxonomyBounds, signal?: AbortSignal): Promise<GeocoderCandidate[]> {
  const output: GeocoderCandidate[] = [];
  for (const query of taxonomyQueryVariants(scope)) {
    const nominatim = new URLSearchParams({
      q: `${query}, Vietnam`, format: 'jsonv2', limit: '5', addressdetails: '1', countrycodes: 'vn', 'accept-language': 'vi',
    });
    if (parentBounds) {
      nominatim.set('viewbox', `${parentBounds.west},${parentBounds.north},${parentBounds.east},${parentBounds.south}`);
      nominatim.set('bounded', '1');
    }
    try {
      const results = await fetchJson<NominatimSearchResult[]>(`https://nominatim.openstreetmap.org/search?${nominatim.toString()}`, signal);
      output.push(...results.map(nominatimCandidate).filter((candidate): candidate is GeocoderCandidate => Boolean(candidate)).map(candidate => ({ ...candidate, score: candidate.score + 300 })));
    } catch {
      // Try the next provider.
    }

    const photon = new URLSearchParams({ q: `${query}, Vietnam`, limit: '5' });
    if (parentBounds) photon.set('bbox', `${parentBounds.west},${parentBounds.south},${parentBounds.east},${parentBounds.north}`);
    try {
      const response = await fetchJson<PhotonResponse>(`https://photon.komoot.io/api/?${photon.toString()}`, signal);
      output.push(...(response.features ?? []).map(photonResult).filter((candidate): candidate is GeocoderCandidate => Boolean(candidate)).map(candidate => ({ ...candidate, score: candidate.score + 200 })));
    } catch {
      // Try ArcGIS below.
    }

    const params = new URLSearchParams({ SingleLine: query, f: 'json', maxLocations: '10', countryCode: 'VNM' });
    if (parentBounds) params.set('searchExtent', `${parentBounds.west},${parentBounds.south},${parentBounds.east},${parentBounds.north}`);
    try {
      const response = await fetchJson<ArcGisResponse>(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params.toString()}`, signal);
      output.push(...(response.candidates ?? []).map(arcGisCandidate).filter((candidate): candidate is GeocoderCandidate => Boolean(candidate)));
    } catch {
      // Continue with the next query variant.
    }
  }
  return output;
}

async function searchGeocode(query: string, intent: GeocodeTarget['intent'], scope?: TaxonomyScope, signal?: AbortSignal): Promise<GeocodeResult | null> {
  if (intent === 'taxonomy') return scope ? searchTaxonomyGeocode(scope, signal) : null;

  const nominatim = new URLSearchParams({
    q: `${query}, Vietnam`, format: 'jsonv2', limit: '1', addressdetails: '1', countrycodes: 'vn', 'accept-language': 'vi',
  });
  try {
    const results = await fetchJson<NominatimSearchResult[]>(`https://nominatim.openstreetmap.org/search?${nominatim.toString()}`, signal);
    const result = results[0];
    const lat = result?.lat ? Number(result.lat) : NaN;
    const lng = result?.lon ? Number(result.lon) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, label: result.display_name || 'Điểm tìm thấy gần đúng' };
  } catch {
    // Try the alternate OSM-backed geocoder below.
  }

  const photon = new URLSearchParams({ q: query, limit: '5' });
  try {
    const response = await fetchJson<PhotonResponse>(`https://photon.komoot.io/api/?${photon.toString()}`, signal);
    for (const feature of response.features ?? []) {
      const result = photonResult(feature);
      if (result) return { lat: result.lat, lng: result.lng, label: result.label };
    }
  } catch {
    // Try ArcGIS as a final provider for address searches.
  }
  return searchArcGis(query, signal);
}

function photonReverseAddress(data: PhotonResponse): string {
  const properties = data.features?.[0]?.properties ?? {};
  return photonLabel(properties);
}

export function canonicalGeocoderQuery(query: string): string {
  return query.replace(/Đắc\s+Lua/gi, 'Đak Lua');
}

export function geocoderQueryVariants(query: string): string[] {
  const canonical = canonicalGeocoderQuery(query);
  const parts = canonical.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return [canonical];
  const typed = ['Phường', 'Xã', 'Thị trấn'].map(prefix => `${prefix} ${parts[0]}, ${parts.slice(1).join(', ')}`);
  return [...new Set([...typed, canonical])];
}

export function pickArcGisCandidate(candidates: ArcGisCandidate[], query: string): GeocodeResult | null {
  const queryParts = query.split(',').map(normalizeSearchPart).filter(Boolean);
  const queryText = queryParts.join(', ');
  const eligible = queryParts.length > 1
    ? candidates.filter(candidate => normalizeSearchPart(candidate.address ?? '').includes(queryParts[0]))
    : candidates;
  if (eligible.length === 0) return null;
  const scored = eligible
    .map(candidate => {
      const label = candidate.address?.trim() ?? '';
      const normalizedLabel = normalizeSearchPart(label);
      const matchScore = queryParts.reduce((score, part, index) => score + (normalizedLabel.includes(part) ? (index === 0 ? 200 : 100) : 0), 0);
      const exactScore = normalizedLabel === queryText ? 1000 : 0;
      const providerScore = Number.isFinite(candidate.score) ? candidate.score ?? 0 : 0;
      return { candidate, score: exactScore + matchScore + providerScore };
    })
    .sort((a, b) => b.score - a.score);
  const winner = scored[0]?.candidate;
  const lat = winner?.location?.y;
  const lng = winner?.location?.x;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: lat as number, lng: lng as number, label: winner?.address || 'Điểm tìm thấy gần đúng' };
}

async function searchArcGis(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const normalizedQuery = canonicalGeocoderQuery(query);
  const results = await Promise.all(geocoderQueryVariants(normalizedQuery).map(async variant => {
    const params = new URLSearchParams({
      SingleLine: variant,
      f: 'json',
      maxLocations: '10',
      countryCode: 'VNM',
    });
    try {
      const response = await fetchJson<ArcGisResponse>(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params.toString()}`, signal);
      return pickArcGisCandidate(response.candidates ?? [], normalizedQuery);
    } catch {
      return null;
    }
  }));
  return results.find((result): result is GeocodeResult => result !== null) ?? null;
}

export function LocationPicker({ lat, lng, onChange, geocodeTarget, onReverseGeocode, height = '280px' }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const searchMarkerRef = useRef<import('leaflet').Marker | null>(null);
  const geoLayerRef = useRef<import('leaflet').GeoJSON | null>(null);
  const iconRef = useRef<import('leaflet').DivIcon | null>(null);
  const candidateIconRef = useRef<import('leaflet').DivIcon | null>(null);
  const lastNonceRef = useRef(-1);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState<MapStatus>('idle');
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReverseRef = useRef(onReverseGeocode);
  onReverseRef.current = onReverseGeocode;

  const removeCandidate = () => {
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;
    setCandidate(null);
  };

  const scheduleReverseGeocode = (nlat: number, nlng: number) => {
    if (!onReverseRef.current) return;
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseControllerRef.current?.abort();
    const requestId = ++requestIdRef.current;
    reverseTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      reverseControllerRef.current = controller;
      try {
        const response = await fetchJson<{ address?: Record<string, string>; display_name?: string }>(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${nlat}&lon=${nlng}&zoom=18&addressdetails=1&accept-language=vi`, controller.signal);
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        const address = shortAddress(response);
        if (address) onReverseRef.current?.(address);
      } catch {
        if (controller.signal.aborted) return;
        try {
          const response = await fetchJson<PhotonResponse>(`https://photon.komoot.io/reverse?lat=${nlat}&lon=${nlng}`, controller.signal);
          if (requestId !== requestIdRef.current || controller.signal.aborted) return;
          const address = photonReverseAddress(response);
          if (address) onReverseRef.current?.(address);
        } catch {
          // Map pin remains valid when reverse-geocoding is unavailable.
        }
      }
    }, 600);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    import('leaflet').then(module => {
      if (disposed || !containerRef.current || mapRef.current) return;
      const L = module.default;
      import('leaflet/dist/leaflet.css');
      const map = L.map(containerRef.current, {
        center: [10.9804, 106.6519],
        zoom: 10,
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = map;
      map.whenReady(() => {
        if (!disposed) {
          map.invalidateSize();
          setMapReady(true);
        }
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);
      iconRef.current = L.divIcon({ className: '', html: PIN_SVG, iconSize: [28, 36], iconAnchor: [14, 36] });
      candidateIconRef.current = L.divIcon({ className: '', html: CANDIDATE_PIN_SVG, iconSize: [28, 36], iconAnchor: [14, 36] });

      const confirmPoint = (nlat: number, nlng: number) => {
        removeCandidate();
        if (!markerRef.current) {
          markerRef.current = L.marker([nlat, nlng], { icon: iconRef.current!, draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            const position = markerRef.current!.getLatLng();
            confirmPoint(position.lat, position.lng);
          });
        } else {
          markerRef.current.setLatLng([nlat, nlng]);
        }
        onChangeRef.current(nlat.toFixed(6), nlng.toFixed(6));
        setStatus('placed');
        scheduleReverseGeocode(nlat, nlng);
      };

      map.on('click', event => confirmPoint(event.latlng.lat, event.latlng.lng));
    }).catch(() => setStatus('error'));

    return () => {
      disposed = true;
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      reverseControllerRef.current?.abort();
      if (mapRef.current) mapRef.current.remove();
      geoLayerRef.current = null;
      mapRef.current = null;
      markerRef.current = null;
      searchMarkerRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const latN = coordinate(lat);
    const lngN = coordinate(lng);
    if (latN === null || lngN === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      if (!candidate) setStatus('idle');
      return;
    }
    import('leaflet').then(module => {
      if (!mapRef.current || !iconRef.current) return;
      const L = module.default;
      if (!markerRef.current) {
        markerRef.current = L.marker([latN, lngN], { icon: iconRef.current, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const position = markerRef.current!.getLatLng();
          onChangeRef.current(position.lat.toFixed(6), position.lng.toFixed(6));
          setStatus('placed');
          scheduleReverseGeocode(position.lat, position.lng);
        });
      } else {
        markerRef.current.setLatLng([latN, lngN]);
      }
      map.setView([latN, lngN], Math.max(map.getZoom(), 14));
      setStatus('placed');
    });
  }, [lat, lng, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !geocodeTarget?.query || geocodeTarget.nonce === lastNonceRef.current) return;
    lastNonceRef.current = geocodeTarget.nonce;
    const searchRequestId = ++searchRequestIdRef.current;
    const controller = new AbortController();
    let cancelled = false;
    removeCandidate();

    const applyViewportResult = (result: GeocodeResult | null) => {
      if (cancelled || controller.signal.aborted || searchRequestId !== searchRequestIdRef.current || !mapRef.current) return;
      if (!result) {
        setStatus('none');
        return;
      }
      const zoom = Math.min(geocodeTarget.zoom, geocodeTarget.intent === 'address' ? 16 : 15);
      mapRef.current.flyTo([result.lat, result.lng], zoom, { duration: 1.2 });
      return result;
    };

    if (geocodeTarget.intent === 'taxonomy' && isValidTaxonomyBounds(geocodeTarget.bounds)) {
      geoLayerRef.current?.remove();
      geoLayerRef.current = null;
      map.fitBounds([[geocodeTarget.bounds.south, geocodeTarget.bounds.west], [geocodeTarget.bounds.north, geocodeTarget.bounds.east]], {
        padding: [24, 24],
        maxZoom: Math.min(geocodeTarget.zoom, 15),
        animate: true,
        duration: 0.8,
      });
      if (geocodeTarget.geojson) {
        import('leaflet').then(module => {
          if (cancelled || controller.signal.aborted || !mapRef.current) return;
          geoLayerRef.current = module.default.geoJSON(geocodeTarget.geojson as never, {
            style: { color: '#dc2626', weight: 2, fillColor: '#ef4444', fillOpacity: 0.08 },
          }).addTo(mapRef.current);
        });
      }
      setStatus(markerRef.current ? 'review' : 'idle');
      return () => { cancelled = true; controller.abort(); };
    }

    setStatus('searching');
    const run = async () => {
      try {
        const result = await searchGeocode(geocodeTarget.query, geocodeTarget.intent, geocodeTarget.taxonomyScope, controller.signal);
        const applied = applyViewportResult(result);
        if (!applied || geocodeTarget.intent !== 'address') {
          if (applied && geocodeTarget.intent === 'taxonomy') setStatus(markerRef.current ? 'review' : 'idle');
          return;
        }
        const nextCandidate = { lat: applied.lat, lng: applied.lng, label: applied.label };
        setCandidate(nextCandidate);
        const L = await import('leaflet').then(module => module.default);
        if (cancelled || controller.signal.aborted || searchRequestId !== searchRequestIdRef.current || !mapRef.current || !candidateIconRef.current) return;
        searchMarkerRef.current = L.marker([applied.lat, applied.lng], { icon: candidateIconRef.current, draggable: true }).addTo(mapRef.current);
        searchMarkerRef.current.on('dragend', () => {
          const position = searchMarkerRef.current!.getLatLng();
          setCandidate(current => current ? { ...current, lat: position.lat, lng: position.lng } : current);
        });
        setStatus('candidate');
      } catch {
        if (!cancelled && !controller.signal.aborted) setStatus('error');
      }
    };
    void run();
    return () => { cancelled = true; controller.abort(); };
  }, [geocodeTarget, mapReady]);

  const confirmCandidate = () => {
    if (!candidate || !mapRef.current) return;
    const map = mapRef.current;
    import('leaflet').then(module => {
      if (!mapRef.current) return;
      const L = module.default;
      removeCandidate();
      if (!markerRef.current) {
        markerRef.current = L.marker([candidate.lat, candidate.lng], { icon: iconRef.current!, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const position = markerRef.current!.getLatLng();
          onChangeRef.current(position.lat.toFixed(6), position.lng.toFixed(6));
          setStatus('placed');
          scheduleReverseGeocode(position.lat, position.lng);
        });
      } else markerRef.current.setLatLng([candidate.lat, candidate.lng]);
      onChangeRef.current(candidate.lat.toFixed(6), candidate.lng.toFixed(6));
      setStatus('placed');
      scheduleReverseGeocode(candidate.lat, candidate.lng);
    });
  };

  const clearPin = () => {
    ++searchRequestIdRef.current;
    ++requestIdRef.current;
    markerRef.current?.remove();
    markerRef.current = null;
    removeCandidate();
    onChangeRef.current('', '');
    setStatus('idle');
    reverseControllerRef.current?.abort();
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
  };

  const statusText = status === 'searching'
    ? 'Đang tìm vị trí trên bản đồ…'
    : status === 'candidate'
      ? 'Ghim vàng là điểm tham khảo. Kiểm tra rồi bấm xác nhận hoặc kéo ghim đến đúng vị trí.'
      : status === 'placed'
        ? 'Ghim đỏ là vị trí sẽ được lưu. Bạn có thể kéo ghim để chỉnh lại.'
        : status === 'review'
          ? 'Bạn vừa đổi khu vực hành chính. Hãy kiểm tra và kéo ghim đỏ về đúng vị trí trước khi lưu.'
          : status === 'missing_geo'
        ? 'Chưa có ranh giới nội bộ; đang thử định vị theo đúng chuỗi tỉnh, huyện, xã.'
        : status === 'none'
          ? 'Không tìm thấy địa chỉ. Hãy thử tên đường/phường ngắn hơn hoặc bấm trực tiếp lên bản đồ.'
          : status === 'error'
            ? 'Không tải được dịch vụ tìm kiếm. Bạn vẫn có thể bấm trực tiếp lên bản đồ để đặt ghim.'
            : 'Bấm vào đúng vị trí trên bản đồ để thả ghim. Vị trí chỉ là điểm tham khảo, không phải ranh giới pháp lý.';

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm" style={{ height }}>
        <div ref={containerRef} className="h-full w-full" />
        {candidate && (
          <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
            <p className="text-xs font-semibold text-amber-800">Kết quả tham khảo</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-gray-600">{candidate.label}</p>
            <button type="button" onClick={confirmCandidate} className="mt-2 min-h-10 w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Xác nhận vị trí này</button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-xs leading-5 ${status === 'error' || status === 'none' || status === 'missing_geo' ? 'text-amber-700' : 'text-gray-600'}`}>{statusText}</p>
        {(markerRef.current || candidate) && <button type="button" onClick={clearPin} className="flex-shrink-0 text-left text-xs font-semibold text-red-600 hover:text-red-700 sm:text-right">Xóa ghim</button>}
      </div>
    </div>
  );
}
