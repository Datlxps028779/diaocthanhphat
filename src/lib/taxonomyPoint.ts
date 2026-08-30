import type { TaxonomyGeo, TaxonomyGeoLevel } from './taxonomyGeo';

export type TaxonomyPoint = { lat: number; lng: number };

export type TaxonomyPointValidation =
  | { valid: true }
  | { valid: false; code: 'missing_selection' | 'missing_geometry' | 'outside'; message: string };

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoordinates = LinearRing[];
type MultiPolygonCoordinates = PolygonCoordinates[];

type PolygonGeometry = { type: 'Polygon'; coordinates: PolygonCoordinates };
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: MultiPolygonCoordinates };
type SupportedGeometry = PolygonGeometry | MultiPolygonGeometry;

const EDGE_EPSILON = 1e-10;

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function isLinearRing(value: unknown): value is LinearRing {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function isPolygonCoordinates(value: unknown): value is PolygonCoordinates {
  return Array.isArray(value) && value.length > 0 && value.every(isLinearRing);
}

function supportedGeometry(value: unknown): SupportedGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === 'Polygon' && isPolygonCoordinates(geometry.coordinates)) {
    return geometry as PolygonGeometry;
  }
  if (geometry.type === 'MultiPolygon'
      && Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every(isPolygonCoordinates)) {
    return geometry as MultiPolygonGeometry;
  }
  return null;
}

function pointOnSegment(point: TaxonomyPoint, a: Position, b: Position): boolean {
  const cross = (point.lng - a[0]) * (b[1] - a[1]) - (point.lat - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) > EDGE_EPSILON) return false;
  return point.lng >= Math.min(a[0], b[0]) - EDGE_EPSILON
    && point.lng <= Math.max(a[0], b[0]) + EDGE_EPSILON
    && point.lat >= Math.min(a[1], b[1]) - EDGE_EPSILON
    && point.lat <= Math.max(a[1], b[1]) + EDGE_EPSILON;
}

function ringContainsPoint(point: TaxonomyPoint, ring: LinearRing): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[previous];
    const b = ring[index];
    if (pointOnSegment(point, a, b)) return 'boundary';
    const crossesLatitude = (a[1] > point.lat) !== (b[1] > point.lat);
    if (!crossesLatitude) continue;
    const crossingLng = ((b[0] - a[0]) * (point.lat - a[1])) / (b[1] - a[1]) + a[0];
    if (point.lng < crossingLng) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

function polygonCoversPoint(point: TaxonomyPoint, polygon: PolygonCoordinates): boolean {
  const outer = ringContainsPoint(point, polygon[0]);
  if (outer === 'outside') return false;
  if (outer === 'boundary') return true;
  for (const hole of polygon.slice(1)) {
    const holeResult = ringContainsPoint(point, hole);
    if (holeResult === 'inside') return false;
    if (holeResult === 'boundary') return true;
  }
  return true;
}

export function geoJsonCoversPoint(geojson: unknown, point: TaxonomyPoint): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  const geometry = supportedGeometry(geojson);
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return polygonCoversPoint(point, geometry.coordinates);
  return geometry.coordinates.some(polygon => polygonCoversPoint(point, polygon));
}

export function normalizePersistedTaxonomyPoint(point: TaxonomyPoint): TaxonomyPoint {
  return {
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  };
}

export function canConfirmTaxonomyCandidate(
  validation: TaxonomyPointValidation,
  requiresManualAdjustment: boolean,
): boolean {
  return validation.valid && !requiresManualAdjustment;
}

export function findExactTaxonomyGeo(
  geo: TaxonomyGeo[],
  level: TaxonomyGeoLevel,
  entityId: string | null | undefined,
): TaxonomyGeo | null {
  if (!entityId) return null;
  return geo.find(item => item.entity_type === level && item.entity_id === entityId) ?? null;
}

export function validatePointForWard(
  point: TaxonomyPoint,
  wardId: string | null | undefined,
  wardGeo: TaxonomyGeo | null | undefined,
  wardLabel = 'xã/phường đã chọn',
): TaxonomyPointValidation {
  if (!wardId) {
    return { valid: false, code: 'missing_selection', message: 'Vui lòng chọn xã/phường trước khi đặt ghim.' };
  }
  if (!wardGeo || wardGeo.entity_type !== 'ward' || wardGeo.entity_id !== wardId || !supportedGeometry(wardGeo.geojson)) {
    return {
      valid: false,
      code: 'missing_geometry',
      message: `${wardLabel} chưa có polygon đã xác minh. Hãy nhập địa chỉ chi tiết và không lưu tọa độ ước lượng.`,
    };
  }
  if (!geoJsonCoversPoint(wardGeo.geojson, point)) {
    return {
      valid: false,
      code: 'outside',
      message: `Điểm này nằm ngoài ranh giới ${wardLabel}. Hãy click hoặc kéo ghim vào bên trong khu vực đã chọn.`,
    };
  }
  return { valid: true };
}
