import { describe, expect, it } from 'vitest';
import {
  buildLocalityFaq,
  evaluateLocalitySeo,
  filterLocalityRows,
  getLocalityReport,
  MIN_PRICE_SAMPLES,
  MIN_REPORT_ANALYTICAL_MODULES,
  MIN_REPORT_INVENTORY,
  type LocalityReportRow,
} from './localityReport';
import { resolveLocalityPageContext, type LocalityTaxonomy } from './localityPageContext';

const taxonomy: LocalityTaxonomy = {
  areas: [
    { id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương' },
    { id: 'a-bp', slug: 'binh-phuoc', name: 'Bình Phước' },
  ],
  districts: [
    { id: 'd-di-an', area_id: 'a-bd', slug: 'binh-duong-di-an', name: 'Dĩ An' },
    { id: 'd-thuan-an', area_id: 'a-bd', slug: 'binh-duong-thuan-an', name: 'Thuận An' },
  ],
  wards: [
    { id: 'w-tdh', district_id: 'd-di-an', slug: 'binh-duong-di-an-tan-dong-hiep', name: 'Tân Đông Hiệp' },
  ],
  propertyTypes: [
    { id: 'pt-nha-pho', slug: 'nha-pho', name: 'Nhà phố' },
    { id: 'pt-dat-nen', slug: 'dat-nen', name: 'Đất nền' },
    // Second member of the "dat" group — makes it multi-member so the group path is real.
    { id: 'pt-dat-mau-dat-sao', slug: 'dat-mau-dat-sao', name: 'Đất mẫu đất sao' },
  ],
};

const context = (pathname: string) => {
  const resolved = resolveLocalityPageContext(pathname, taxonomy);
  if (!resolved) throw new Error(`unresolved fixture path ${pathname}`);
  return resolved;
};

const row = (id: string, overrides: Partial<LocalityReportRow> = {}): LocalityReportRow => ({
  id,
  title: `Tin ${id}`,
  area_id: 'a-bd',
  district_id: 'd-di-an',
  ward_id: 'w-tdh',
  property_type_id: 'pt-nha-pho',
  listing_type: 'mua_ban',
  price: 2,
  price_unit: 'tỷ',
  price_per_month: null,
  area_sqm: 100,
  ...overrides,
});

describe('filterLocalityRows', () => {
  it('scopes by area, district, ward and listing type from IDs, not slugs', () => {
    const rows = [
      row('a'),
      row('b', { district_id: 'd-thuan-an' }),
      row('c', { area_id: 'a-bp', district_id: null }),
      row('d', { listing_type: 'cho_thue' }),
      row('e', { ward_id: null }),
    ];
    // Sale scope keeps only sale rows in the area, including rows with no ward.
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong')).map(r => r.id)).toEqual(['a', 'b', 'e']);
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/di-an')).map(r => r.id)).toEqual(['a', 'e']);
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep')).map(r => r.id)).toEqual(['a']);
    expect(filterLocalityRows(rows, context('/cho-thue/binh-duong')).map(r => r.id)).toEqual(['d']);
  });

  it('matches a multi-member group strictly by taxonomy type ID (UUID), not by slug', () => {
    // "dat" has TWO member types; rows carry real UUIDs. A slug-vs-ID comparison finds
    // nothing, which previously made the group filter disappear entirely.
    const rows = [
      row('nha', { property_type_id: 'pt-nha-pho' }),
      row('dat-1', { property_type_id: 'pt-dat-nen' }),
      row('dat-2', { property_type_id: 'pt-dat-mau-dat-sao' }),
    ];
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/loai/dat')).map(r => r.id))
      .toEqual(['dat-1', 'dat-2']);
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/loai/nha')).map(r => r.id))
      .toEqual(['nha']);
  });

  it('yields zero inventory for a group the taxonomy has no member type for', () => {
    // No day-tro type exists in this taxonomy, so the facet is genuinely empty — it must
    // not inherit every typed row in the province.
    const rows = [row('a'), row('b'), row('c'), row('d'), row('e'), row('f')];
    const scoped = filterLocalityRows(rows, context('/mua-ban/binh-duong/loai/day-tro'));
    expect(scoped).toEqual([]);
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/loai/day-tro'), 'now');
    expect(report.counts.total).toBe(0);
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/loai/day-tro'), report);
    expect(evaluation.indexable).toBe(false);
    expect(evaluation.reasons).toContain('not_enough_active_listings');
  });

  it('keeps an exact type strict even when its group has no other member', () => {
    const rows = [row('nha', { property_type_id: 'pt-nha-pho' }), row('dat', { property_type_id: 'pt-dat-nen' })];
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/di-an/nha-pho')).map(r => r.id)).toEqual(['nha']);
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/loai/nha-pho')).map(r => r.id)).toEqual(['nha']);
  });

  it('reports per-sqm sample count even below the mean threshold', () => {
    const rows = [
      row('p1', { price: 1, area_sqm: 100 }),
      row('p2', { price: 2, area_sqm: 100 }),
    ];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.price.sale.sampleMet).toBe(false);
    expect(report.price.sale.meanVnd).toBeNull();
    // The audit count must still be populated — it is a real count, not a derived stat.
    expect(report.price.sale.perSqmSampleCount).toBe(2);
    expect(report.sampleCounts.perSqmSamples).toBe(2);
  });

  it('never classifies an unknown listing type as sale', () => {
    const rows = [
      row('sale', { listing_type: 'mua_ban', price: 2 }),
      row('rent', { listing_type: 'cho_thue', price: null, price_per_month: 5, price_unit: 'triệu' }),
      row('weird', { listing_type: 'khong-ro', price: 99 }),
      row('null-type', { listing_type: null, price: 99 }),
    ];
    const report = getLocalityReport(rows, context('/khu-vuc/binh-duong'), 'now');
    expect(report.counts.total).toBe(4);
    expect(report.counts.sale).toBe(1);
    expect(report.counts.rent).toBe(1);
    expect(report.counts.unknownListingType).toBe(2);
    // A garbage price must not leak into the sale aggregate.
    expect(report.price.sale.count).toBe(1);
    expect(report.price.sale.meanVnd).toBeNull();
  });

  it('filters rows to the normalized VND boundaries of a price band', () => {
    const rows = [
      row('cheap', { price: 0.8, price_unit: 'tỷ' }),
      row('mid', { price: 2.5, price_unit: 'tỷ' }),
      row('boundary-2', { price: 2, price_unit: 'tỷ' }),
      row('boundary-5', { price: 5, price_unit: 'tỷ' }),
      row('no-price', { price: null }),
      row('bad-unit', { price: 3, price_unit: 'usd' }),
      row('rent-in-band', { listing_type: 'cho_thue', price: null, price_per_month: 3, price_unit: 'triệu' }),
    ];
    // Band is a ROW FILTER over normalized VND: min inclusive, max exclusive.
    // A row with no valid price never belongs to a band (not defaulted into one).
    const rowsInScope = filterLocalityRows(rows, context('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty'));
    expect(rowsInScope.map(r => r.id)).toEqual(['mid', 'boundary-2']);

    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty'), 'now');
    // The report describes only the band's own scope.
    expect(report.counts.total).toBe(2);
    expect(report.distributions.priceBands).toMatchObject({ 'tu-2-den-duoi-5-ty': 2 });
  });

  it('excludes the band maximum and includes the band minimum at the exact boundary', () => {
    const rows = [
      row('at-1', { price: 1, price_unit: 'tỷ' }),
      row('just-under-2', { price: 1.999, price_unit: 'tỷ' }),
      row('at-2', { price: 2, price_unit: 'tỷ' }),
    ];
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/gia/tu-1-den-duoi-2-ty')).map(r => r.id))
      .toEqual(['at-1', 'just-under-2']);
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty')).map(r => r.id))
      .toEqual(['at-2']);
  });

  it('writes an open-ended band with only a lower bound', () => {
    const rows = [row('under', { price: 0.5, price_unit: 'tỷ' }), row('at-5', { price: 5, price_unit: 'tỷ' }), row('over', { price: 9, price_unit: 'tỷ' })];
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/gia/tu-5-ty')).map(r => r.id)).toEqual(['at-5', 'over']);
    expect(filterLocalityRows(rows, context('/mua-ban/binh-duong/gia/duoi-1-ty')).map(r => r.id)).toEqual(['under']);
  });
});

describe('getLocalityReport — counts and price', () => {
  it('separates sale/rent counts and buckets rows with no ward as unknown', () => {
    const rows = [
      row('s1'), row('s2'), row('s3'), row('s4'), row('s5'),
      row('r1', { listing_type: 'cho_thue', price: null, price_per_month: 5, price_unit: 'triệu' }),
      row('noward', { ward_id: null }),
    ];
    // Scope "tất cả" (tổng quan tỉnh) giữ cả bán lẫn thuê.
    const all = getLocalityReport(rows, context('/khu-vuc/binh-duong'), '2026-09-16T00:00:00.000Z');
    expect(all.computedAt).toBe('2026-09-16T00:00:00.000Z');
    expect(all.counts.total).toBe(7);
    expect(all.counts.sale).toBe(6);
    expect(all.counts.rent).toBe(1);
    expect(all.counts.unknownWard).toBe(1);
    expect(all.distributions.wards.unknown).toBe(1);

    // Scope giao dịch bán chỉ giữ tin bán.
    const sale = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(sale.counts.total).toBe(6);
    expect(sale.counts.sale).toBe(6);
    expect(sale.counts.rent).toBe(0);
  });

  it('computes mean, median, min, max and per-sqm only from valid own samples', () => {
    const rows = [
      row('p1', { price: 1, area_sqm: 100 }),
      row('p2', { price: 2, area_sqm: 100 }),
      row('p3', { price: 3, area_sqm: 100 }),
    ];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.price.sale).toMatchObject({
      count: 3, meanVnd: 2_000_000_000, medianVnd: 2_000_000_000,
      minVnd: 1_000_000_000, maxVnd: 3_000_000_000, sampleMet: true,
    });
    // per-sqm from each listing price/area, not mean price / mean area.
    expect(report.price.sale.perSqmVnd).toBe(20_000_000);
    expect(report.price.sale.perSqmSampleCount).toBe(3);
  });

  it('does not reduce mean/median/perSqm below the sample threshold but keeps the count', () => {
    const rows = [row('p1', { price: 1 }), row('p2', { price: 2 })];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.price.sale.count).toBe(2);
    expect(report.price.sale.meanVnd).toBeNull();
    expect(report.price.sale.medianVnd).toBeNull();
    expect(report.price.sale.maxVnd).toBeNull();
    expect(report.price.sale.sampleMet).toBe(false);
    expect(MIN_PRICE_SAMPLES).toBe(3);
  });

  it('excludes null, zero, negative, Infinity and unsupported units — never coerced to 0', () => {
    const rows = [
      row('ok', { price: 2, price_unit: 'tỷ' }),
      row('null', { price: null }),
      row('zero', { price: 0 }),
      row('neg', { price: -5 }),
      row('inf', { price: Number.POSITIVE_INFINITY }),
      row('nan', { price: Number.NaN }),
      row('usd', { price: 5, price_unit: 'usd' }),
      row('label', { price: null, price_unit: null }),
    ];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.counts.total).toBe(8);
    expect(report.price.sale.count).toBe(1);
    expect(report.price.sale.excludedCount).toBe(7);
    expect(report.price.sale.meanVnd).toBeNull();
  });

  it('uses monthly rent for rent scope and reports it only when there are enough samples', () => {
    const rows = [
      row('r1', { listing_type: 'cho_thue', price: null, price_per_month: 5, price_unit: 'triệu' }),
      row('r2', { listing_type: 'cho_thue', price: null, price_per_month: 10, price_unit: 'triệu' }),
      row('r3', { listing_type: 'cho_thue', price: null, price_per_month: 15, price_unit: 'triệu' }),
    ];
    const report = getLocalityReport(rows, context('/cho-thue/binh-duong'), 'now');
    expect(report.price.rent).toMatchObject({ count: 3, meanVnd: 10_000_000, medianVnd: 10_000_000, sampleMet: true });
    // A rent scope must not fabricate a sale aggregate.
    expect(report.price.sale.count).toBe(0);
  });

  it('builds district, ward, type and price-band distributions that reconcile to the total', () => {
    const rows = [
      row('p1', { price: 0.5, district_id: 'd-di-an', property_type_id: 'pt-nha-pho' }),
      row('p2', { price: 1.5, district_id: 'd-thuan-an', property_type_id: 'pt-dat-nen' }),
      row('p3', { price: 3, district_id: 'd-thuan-an', property_type_id: null }),
      row('p4', { price: 7, district_id: null, ward_id: null, property_type_id: 'pt-nha-pho' }),
    ];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.distributions.districts).toMatchObject({ 'd-di-an': 1, 'd-thuan-an': 2, unknown: 1 });
    expect(report.distributions.wards).toMatchObject({ 'w-tdh': 3, unknown: 1 });
    expect(report.distributions.propertyTypes).toMatchObject({ 'pt-nha-pho': 2, 'pt-dat-nen': 1, unknown: 1 });
    expect(report.distributions.priceBands).toMatchObject({ 'duoi-1-ty': 1, 'tu-1-den-duoi-2-ty': 1, 'tu-2-den-duoi-5-ty': 1, 'tu-5-ty': 1 });
    const districtSum = Object.values(report.distributions.districts).reduce((a, b) => a + b, 0);
    expect(districtSum).toBe(report.counts.total);
    const bandSum = Object.values(report.distributions.priceBands).reduce((a, b) => a + b, 0);
    expect(bandSum).toBe(report.counts.total);
  });

  it('counts distinct non-empty titles for the inventory gate', () => {
    const rows = [
      row('1', { title: 'Nhà phố Dĩ An 100m2' }),
      row('2', { title: 'Nhà phố Dĩ An 100m2' }),
      row('3', { title: '  ' }),
      row('4', { title: null as unknown as string }),
      row('5', { title: 'Đất nền Thuận An' }),
    ];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.titledCount).toBe(3);
    expect(report.distinctTitleCount).toBe(2);
  });

  it('is deterministic — same rows and time yield identical reports', () => {
    const rows = [row('a'), row('b'), row('c', { price: 5 })];
    expect(getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now'))
      .toEqual(getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now'));
  });

  it('never emits a min/max from a group with fewer than three valid samples', () => {
    const rows = [row('p1', { price: 1, area_sqm: 100 }), row('p2', { price: 9, area_sqm: 100 })];
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now');
    expect(report.price.sale.minVnd).toBeNull();
    expect(report.price.sale.maxVnd).toBeNull();
    expect(report.price.sale.perSqmVnd).toBeNull();
  });
});

describe('evaluateLocalitySeo', () => {
  const richRows = (n: number, overrides: Partial<LocalityReportRow> = {}) =>
    Array.from({ length: n }, (_, i) => row(`p${i}`, {
      title: `Tin số ${i} Dĩ An`, price: 1 + i, area_sqm: 80 + i, property_type_id: i % 2 ? 'pt-dat-nen' : 'pt-nha-pho', ...overrides,
    }));

  it('returns robots.index=false with a reason when inventory is below the minimum', () => {
    // /khu-vuc/a là scope tổng quan tỉnh có gate riêng — kiểm ngưỡng inventory ở đây.
    const report = getLocalityReport(richRows(4), context('/khu-vuc/binh-duong'), 'now');
    const evaluation = evaluateLocalitySeo(context('/khu-vuc/binh-duong'), report);
    expect(evaluation.indexable).toBe(false);
    expect(evaluation.reasons).toContain('not_enough_active_listings');
    expect(evaluation.robots).toEqual({ index: false, follow: true });
    expect(MIN_REPORT_INVENTORY).toBe(5);
  });

  it('keeps a bare province listing and a bare district URL noindex even with enough data', () => {
    const rows = richRows(10);
    // /mua-ban/a (giao dịch cấp tỉnh trần) và /a/d (huyện trần) giữ noindex như gate cũ.
    for (const pathname of ['/mua-ban/binh-duong', '/mua-ban/binh-duong/di-an']) {
      const evaluation = evaluateLocalitySeo(context(pathname), getLocalityReport(rows, context(pathname), 'now'));
      expect(evaluation.indexable, pathname).toBe(false);
      expect(evaluation.reasons, pathname).toContain('legacy_scope_noindex');
    }
  });

  it('keeps a legacy EXACT type slug noindex, but indexes the legacy district primary group', () => {
    const rows = richRows(10);
    // Loại hình chính xác cũ (nha-pho) vẫn noindex.
    const exact = evaluateLocalitySeo(
      context('/mua-ban/binh-duong/di-an/nha-pho'),
      getLocalityReport(rows, context('/mua-ban/binh-duong/di-an/nha-pho'), 'now'),
    );
    expect(exact.indexable).toBe(false);
    expect(exact.reasons).toContain('legacy_scope_noindex');

    // Nhóm nha/dat cấp huyện giữ policy index cũ, cần mô tả + đủ ngưỡng.
    const group = evaluateLocalitySeo(
      context('/mua-ban/binh-duong/di-an/nha'),
      getLocalityReport(rows, context('/mua-ban/binh-duong/di-an/nha'), 'now'),
    );
    expect(group.indexable).toBe(true);
    expect(group.reasons).toEqual([]);

    // Nhóm day-tro không nằm trong ngoại lệ nha/dat → noindex.
    const dayTro = evaluateLocalitySeo(
      context('/mua-ban/binh-duong/di-an/day-tro'),
      getLocalityReport(rows, context('/mua-ban/binh-duong/di-an/day-tro'), 'now'),
    );
    expect(dayTro.indexable).toBe(false);
    expect(dayTro.reasons).toContain('legacy_scope_noindex');
  });

  it('indexes the new province-level namespaces (loai, gia) when thresholds are met', () => {
    const rows = richRows(10);
    for (const pathname of ['/mua-ban/binh-duong/loai/nha', '/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty']) {
      const scoped = context(pathname);
      const report = getLocalityReport(rows, scoped, 'now');
      const evaluation = evaluateLocalitySeo(scoped, report);
      // Only assert the scope policy; an empty band legitimately fails inventory.
      expect(evaluation.reasons, pathname).not.toContain('legacy_scope_noindex');
    }
  });

  it('indexes a ward namespace page when thresholds are met', () => {
    const rows = richRows(10);
    const scoped = context('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep');
    const report = getLocalityReport(rows, scoped, 'now');
    const evaluation = evaluateLocalitySeo(scoped, report);
    expect(evaluation.indexable).toBe(true);
    expect(evaluation.reasons).toEqual([]);
  });

  it('marks a report indexable only with enough titled inventory, price samples and analytical modules', () => {
    const rows = richRows(8);
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), 'now');
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/thong-tin'), report);
    expect(evaluation.indexable).toBe(true);
    expect(evaluation.reasons).toEqual([]);
    expect(report.analyticalModules.length).toBeGreaterThanOrEqual(MIN_REPORT_ANALYTICAL_MODULES);
  });

  it('refuses report indexing when there are not enough distinct titles', () => {
    const rows = richRows(8, { title: 'Cùng một tiêu đề' });
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), 'now');
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/thong-tin'), report);
    expect(evaluation.indexable).toBe(false);
    expect(evaluation.reasons).toContain('not_enough_distinct_titles');
  });

  it('refuses report indexing when there are not enough valid price samples', () => {
    const rows = richRows(8, { price: null, price_unit: null });
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), 'now');
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/thong-tin'), report);
    expect(evaluation.indexable).toBe(false);
    expect(evaluation.reasons).toContain('not_enough_price_samples');
  });

  it('refuses report indexing when analytical modules are just the intro/FAQ/count boilerplate', () => {
    const rows = richRows(8, { price: null, price_unit: null, area_sqm: null, property_type_id: null, district_id: null, ward_id: null });
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), 'now');
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/thong-tin'), report);
    expect(evaluation.indexable).toBe(false);
    expect(evaluation.reasons).toContain('not_enough_analytical_modules');
  });

  it('keeps a province landing noindex when it has no description', () => {
    const rows = richRows(8);
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/di-an/nha'), 'now');
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/di-an/nha'), report, { hasDescription: false });
    expect(evaluation.indexable).toBe(false);
    expect(evaluation.reasons).toContain('missing_unique_description');
  });

  it('permits a province-level report when quality thresholds are met', () => {
    const rows = richRows(8);
    const scoped = context('/khu-vuc/binh-duong/thong-tin');
    const report = getLocalityReport(rows, scoped, 'now');
    const evaluation = evaluateLocalitySeo(scoped, report);
    expect(evaluation.indexable).toBe(true);
    expect(evaluation.reasons).toEqual([]);
  });

  it('exposes a stable scopeVersion/dataVersion for sitemap and search visibility parity', () => {
    const rows = richRows(8);
    const report = getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), '2026-09-16T00:00:00.000Z');
    const evaluation = evaluateLocalitySeo(context('/mua-ban/binh-duong/thong-tin'), report);
    expect(evaluation.scopeVersion).toBe('locality-scope-v1');
    expect(evaluation.dataVersion).toBe('2026-09-16T00:00:00.000Z');
  });
});

describe('buildLocalityFaq', () => {
  it('asks scoped count questions split by sale, rent and all', () => {
    const rows = [
      row('s1'), row('s2'),
      row('r1', { listing_type: 'cho_thue', price: null, price_per_month: 5, price_unit: 'triệu' }),
    ];
    const saleFaq = buildLocalityFaq(context('/mua-ban/binh-duong'), getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now'));
    expect(saleFaq.some(item => /bán/i.test(item.question) && item.answer.includes('2'))).toBe(true);

    const allFaq = buildLocalityFaq(context('/khu-vuc/binh-duong'), getLocalityReport(rows, context('/khu-vuc/binh-duong'), 'now'));
    expect(allFaq.some(item => /bao nhiêu/i.test(item.question) && item.answer.includes('3'))).toBe(true);
  });

  it('still returns a truthful count FAQ for valid geography with zero inventory', () => {
    // Zero inventory is a real, publishable state — the answer must say 0 and cite the
    // source, not vanish. An empty answer would hide the fact rather than report it.
    const faq = buildLocalityFaq(context('/mua-ban/binh-duong'), getLocalityReport([], context('/mua-ban/binh-duong'), 'now'));
    expect(faq.length).toBeGreaterThan(0);
    const count = faq.find(item => /hiện có bao nhiêu tin/i.test(item.question));
    expect(count).toBeDefined();
    expect(count!.answer).toContain('0 tin');
    expect(count!.answer).toContain('Chọn Nhà Việt');
    // No price question when there is nothing to price.
    expect(faq.some(item => /khoảng bao nhiêu/i.test(item.question) && /Giá/.test(item.question))).toBe(false);
  });

  it('answers a zero-inventory report with method, source and sample limits', () => {
    const scoped = context('/khu-vuc/binh-duong/thong-tin');
    const faq = buildLocalityFaq(scoped, getLocalityReport([], scoped, 'now'));
    expect(faq.length).toBeGreaterThan(0);
    expect(faq.some(item => /phương pháp nào/i.test(item.question))).toBe(true);
    // Must explain WHY no price is shown, rather than silently omitting it.
    expect(faq.some(item => /chưa hiển thị giá trung bình/i.test(item.question))).toBe(true);
  });

  it('never asserts infrastructure, price growth or investment advice', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(`p${i}`, { title: `Tin ${i}`, price: 1 + i }));
    const faq = buildLocalityFaq(context('/mua-ban/binh-duong/thong-tin'), getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), 'now'));
    const text = JSON.stringify(faq).toLowerCase();
    for (const forbidden of ['sinh lời', 'đầu tư tốt nhất', 'tăng giá', 'quy hoạch', 'chuyên gia']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('adds methodology questions on a report page', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row(`p${i}`, { title: `Tin ${i}`, price: 1 + i })),
      row('noward', { ward_id: null, title: 'Tin chưa gắn xã', price: 3 }),
    ];
    const faq = buildLocalityFaq(context('/mua-ban/binh-duong/thong-tin'), getLocalityReport(rows, context('/mua-ban/binh-duong/thong-tin'), 'now'));
    expect(faq.some(item => /phương pháp nào/i.test(item.question))).toBe(true);
    expect(faq.some(item => /trung bình và trung vị/i.test(item.question))).toBe(true);
    expect(faq.some(item => /bao nhiêu tin được dùng để tính giá/i.test(item.question))).toBe(true);
    // A report with rows missing a ward must explain the unknown bucket, not hide it.
    expect(faq.some(item => /chưa gắn phường\/xã/.test(item.answer))).toBe(true);
    // Landing pages stay lean — no methodology questions there.
    const landingFaq = buildLocalityFaq(context('/mua-ban/binh-duong'), getLocalityReport(rows, context('/mua-ban/binh-duong'), 'now'));
    expect(landingFaq.some(item => /phương pháp nào/i.test(item.question))).toBe(false);
  });

  it('emits methodology FAQs on a report instead of duplicating landing count/price Qs', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(`p${i}`, { title: `Tin ${i}`, price: 1 + i }));
    const reportFaq = buildLocalityFaq(context('/khu-vuc/binh-duong/thong-tin'), getLocalityReport(rows, context('/khu-vuc/binh-duong/thong-tin'), 'now'));
    const landingFaq = buildLocalityFaq(context('/khu-vuc/binh-duong'), getLocalityReport(rows, context('/khu-vuc/binh-duong'), 'now'));

    // Landing still asks the count and price questions.
    expect(landingFaq.some(item => /hiện có bao nhiêu tin bất động sản/i.test(item.question))).toBe(true);
    expect(landingFaq.some(item => /Giá chào bán/i.test(item.question))).toBe(true);

    // Report must NOT repeat any landing question verbatim, and must carry no count/price
    // question of its own — it explains method, not inventory.
    const landingQuestions = new Set(landingFaq.map(item => item.question));
    for (const item of reportFaq) {
      expect(landingQuestions.has(item.question), item.question).toBe(false);
    }
    expect(reportFaq.some(item => /hiện có bao nhiêu tin/i.test(item.question))).toBe(false);
    expect(reportFaq.some(item => /Giá chào (bán|thuê)/i.test(item.question))).toBe(false);
    // It does carry methodology.
    expect(reportFaq.some(item => /phương pháp nào/i.test(item.question))).toBe(true);
  });

  it('states the true effect of a missing ward — price stats keep it, only ward split drops it', () => {
    // Rows WITH prices but WITHOUT a ward must still count toward the price stats.
    const rows = [
      row('s1', { title: 'Tin 1', price: 2, ward_id: null }),
      row('s2', { title: 'Tin 2', price: 4, ward_id: null }),
      row('s3', { title: 'Tin 3', price: 6, ward_id: null }),
    ];
    const scoped = context('/mua-ban/binh-duong/thong-tin');
    const report = getLocalityReport(rows, scoped, 'now');
    // Precondition: the prices ARE included despite the missing ward.
    expect(report.counts.unknownWard).toBe(3);
    expect(report.price.sale.meanVnd).toBe(4_000_000_000);

    const faq = buildLocalityFaq(scoped, report);
    const missing = faq.find(item => /chưa đủ dữ liệu/i.test(item.question));
    expect(missing).toBeDefined();
    // Must NOT claim the rows are excluded from price stats.
    expect(missing!.answer).toContain('vẫn được tính vào thống kê giá');
    expect(missing!.answer).not.toMatch(/không đóng góp vào thống kê giá[^)]*phường\/xã/);
  });

  it('names the narrowed facet in FAQ counts so a scoped count is not read as province-wide', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(`p${i}`, { title: `Tin ${i}`, price: 3 }));
    const scoped = context('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty');
    const faq = buildLocalityFaq(scoped, getLocalityReport(rows, scoped, 'now'));
    const count = faq.find(item => /hiện có bao nhiêu tin/i.test(item.question));
    expect(count).toBeDefined();
    // The label must carry the band, so "5 tin" cannot be misread as the whole province.
    expect(count!.question).toContain('Từ 2 đến dưới 5 tỷ');
  });

  it('explains an unknown listing-type bucket rather than folding it into sale', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row(`p${i}`, { title: `Tin ${i}`, price: 1 + i })),
      row('weird', { title: 'Tin lạ', listing_type: 'khong-ro' }),
    ];
    const scoped = context('/khu-vuc/binh-duong/thong-tin');
    const report = getLocalityReport(rows, scoped, 'now');
    expect(report.counts.unknownListingType).toBe(1);
    const faq = buildLocalityFaq(scoped, report);
    expect(faq.some(item => /chưa xác định loại giao dịch/.test(item.answer))).toBe(true);
  });

  it('labels rent mean, median and range with an explicit monthly unit', () => {
    const rows = [
      row('r1', { listing_type: 'cho_thue', price: null, price_per_month: 5, price_unit: 'triệu', title: 'Tin r1' }),
      row('r2', { listing_type: 'cho_thue', price: null, price_per_month: 10, price_unit: 'triệu', title: 'Tin r2' }),
      row('r3', { listing_type: 'cho_thue', price: null, price_per_month: 15, price_unit: 'triệu', title: 'Tin r3' }),
    ];
    // Report carries no price question, so the rent figures live on the landing FAQ.
    const faq = buildLocalityFaq(context('/cho-thue/binh-duong'), getLocalityReport(rows, context('/cho-thue/binh-duong'), 'now'));
    const rent = faq.find(item => /Giá thuê bất động sản/i.test(item.question));
    expect(rent).toBeDefined();
    // mean (10), median (10) and BOTH bounds of the range must carry the monthly unit.
    expect(rent!.answer).toContain('10 triệu/tháng');
    expect(rent!.answer).toContain('5 triệu/tháng');
    expect(rent!.answer).toContain('15 triệu/tháng');
  });

  it('excludes an overflowing monthly rent instead of poisoning the aggregate', () => {
    const rows = [
      row('ok1', { listing_type: 'cho_thue', price: null, price_per_month: 5, price_unit: 'triệu' }),
      row('ok2', { listing_type: 'cho_thue', price: null, price_per_month: 10, price_unit: 'triệu' }),
      row('ok3', { listing_type: 'cho_thue', price: null, price_per_month: 15, price_unit: 'triệu' }),
      // price_per_month * 1e6 overflows to Infinity — must be dropped, not counted.
      row('overflow', { listing_type: 'cho_thue', price: null, price_per_month: Number.MAX_VALUE, price_unit: 'triệu' }),
    ];
    const report = getLocalityReport(rows, context('/cho-thue/binh-duong'), 'now');
    expect(report.counts.total).toBe(4);
    expect(report.price.rent.count).toBe(3);
    expect(report.price.rent.meanVnd).toBe(10_000_000);
    expect(Number.isFinite(report.price.rent.meanVnd!)).toBe(true);
    expect(report.price.rent.maxVnd).toBe(15_000_000);
  });
});
