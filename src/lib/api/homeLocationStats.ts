import type { HomeLocationStats } from '../homeLocationStats';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPrice(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function isStats(value: unknown): value is HomeLocationStats {
  if (!isRecord(value) || typeof value.computedAt !== 'string' || !Number.isFinite(Date.parse(value.computedAt))
    || !isCount(value.totalCount) || !isRecord(value.areas)) return false;
  return Object.values(value.areas).every(area => isRecord(area)
    && isCount(area.count) && isCount(area.saleCount) && isCount(area.pricedSaleCount) && isCount(area.sqmSampleCount)
    && isPrice(area.minSalePriceVnd) && isPrice(area.avgSalePriceVnd) && isPrice(area.avgSalePricePerSqmVnd)
    && isRecord(area.districtCounts) && Object.values(area.districtCounts).every(isCount));
}

export async function getHomeLocationStats(signal?: AbortSignal): Promise<HomeLocationStats> {
  const response = await fetch('/api/public/location-stats', { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('Không tải được số liệu khu vực');
  const data: unknown = await response.json();
  if (!isStats(data)) throw new Error('Số liệu khu vực không hợp lệ');
  return data;
}
