import { getEffectiveListingPrice, priceToVnd } from './listingPrice';

/** Server-only input projection; this shape is never returned by the public endpoint. */
export type HomeLocationPropertyRow = {
  id: string;
  area_id: string | null;
  district_id: string | null;
  listing_type: string | null;
  price: number | null;
  price_unit: string | null;
  price_per_month: number | null;
  area_sqm: number | null;
};

export type HomeAreaStats = {
  count: number;
  saleCount: number;
  pricedSaleCount: number;
  sqmSampleCount: number;
  minSalePriceVnd: number | null;
  avgSalePriceVnd: number | null;
  avgSalePricePerSqmVnd: number | null;
  districtCounts: Record<string, number>;
};

export type HomeLocationStats = {
  computedAt: string;
  totalCount: number;
  areas: Record<string, HomeAreaStats>;
};

/** Call only after the server has verified a complete public active-row read. */
export function aggregateHomeLocationStats(
  rows: readonly HomeLocationPropertyRow[],
  computedAt = new Date().toISOString(),
): HomeLocationStats {
  const areas: Record<string, HomeAreaStats> = Object.create(null);
  const means = new Map<string, { price: number; sqm: number }>();
  for (const row of rows) {
    if (!row.area_id) continue; // Unknown geography still contributes to totalCount.
    const stats = areas[row.area_id] ?? (areas[row.area_id] = {
      count: 0, saleCount: 0, pricedSaleCount: 0, sqmSampleCount: 0,
      minSalePriceVnd: null, avgSalePriceVnd: null, avgSalePricePerSqmVnd: null,
      districtCounts: Object.create(null),
    });
    stats.count++;
    if (row.district_id) stats.districtCounts[row.district_id] = (stats.districtCounts[row.district_id] ?? 0) + 1;
    if (row.listing_type !== 'mua_ban') continue;
    stats.saleCount++;
    // listingPrice intentionally defaults missing/unknown sale units to tỷ for display.
    // Statistics must not infer a unit: only explicitly supported sale units are eligible.
    if (row.price_unit !== 'tỷ' && row.price_unit !== 'triệu') continue;
    const effective = getEffectiveListingPrice(row);
    if (effective.source !== 'price') continue;
    const price = priceToVnd(row);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    stats.pricedSaleCount++;
    stats.minSalePriceVnd = stats.minSalePriceVnd == null ? price : Math.min(stats.minSalePriceVnd, price);
    const mean = means.get(row.area_id) ?? { price: 0, sqm: 0 };
    // Incremental means avoid overflowing a large running sum.
    mean.price += (price - mean.price) / stats.pricedSaleCount;
    if (row.area_sqm != null && Number.isFinite(row.area_sqm) && row.area_sqm > 0) {
      const perSqm = price / row.area_sqm;
      if (Number.isFinite(perSqm) && perSqm > 0) {
        stats.sqmSampleCount++;
        mean.sqm += (perSqm - mean.sqm) / stats.sqmSampleCount;
      }
    }
    means.set(row.area_id, mean);
  }
  for (const [areaId, mean] of means) {
    const stats = areas[areaId];
    if (stats.pricedSaleCount >= 3) stats.avgSalePriceVnd = mean.price;
    if (stats.sqmSampleCount >= 3) stats.avgSalePricePerSqmVnd = mean.sqm;
  }
  return { computedAt, totalCount: rows.length, areas };
}

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const validPrice = (value: number) => Number.isFinite(value) && value > 0;

export function formatLocationPrice(vnd: number): string {
  if (!validPrice(vnd)) return 'Đang cập nhật';
  return vnd >= 1e9 ? `${numberFormat.format(vnd / 1e9)} tỷ` : `${numberFormat.format(vnd / 1e6)} triệu`;
}

export function formatLocationPricePerSqm(vnd: number): string {
  if (!validPrice(vnd)) return 'Đang cập nhật';
  return vnd >= 1e6 ? `${numberFormat.format(vnd / 1e6)} tr/m²` : `${numberFormat.format(vnd / 1e3)} nghìn/m²`;
}
