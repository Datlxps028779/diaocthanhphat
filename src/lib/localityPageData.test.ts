import { describe, expect, it } from 'vitest';
import { buildLocalityPageData, buildLocalityMetadata } from './localityPageData';

const snapshot = {
  computedAt: '2026-09-16T06:00:00Z',
  areas: [{ id: 'a', slug: 'binh-duong', name: 'Bình Dương', description: 'Thông tin địa phương từ tin công khai.' }],
  districts: [{ id: 'd', area_id: 'a', slug: 'binh-duong-di-an', name: 'Dĩ An' }],
  wards: [{ id: 'w', district_id: 'd', slug: 'binh-duong-di-an-tan-dong-hiep', name: 'Tân Đông Hiệp' }],
  propertyTypes: [{ id: 't', slug: 'dat-nen', name: 'Đất nền' }],
  rows: Array.from({ length: 6 }, (_, i) => ({ id: String(i), title: `Đất nền ${i}`, area_id: 'a', district_id: 'd', ward_id: i ? 'w' : null, property_type_id: 't', listing_type: 'mua_ban', price: i + 1, price_unit: 'tỷ', price_per_month: null, area_sqm: 100 })),
};

describe('locality page data boundary', () => {
  it('keeps report canonical distinct and never ships raw snapshot rows', () => {
    const data = buildLocalityPageData('/khu-vuc/binh-duong/thong-tin', snapshot)!;
    expect(data.context.mode).toBe('report');
    expect(buildLocalityMetadata(data).alternates?.canonical).toBe('/khu-vuc/binh-duong/thong-tin');
    expect(data).not.toHaveProperty('rows');
    expect(data).not.toHaveProperty('snapshot');
    expect(data.report.counts.unknownWard).toBe(1);
  });
  it('404s newly introduced empty type/price facets, not valid empty geography', () => {
    expect(buildLocalityPageData('/mua-ban/binh-duong/gia/duoi-1-ty', snapshot)).toBeNull();
    expect(buildLocalityPageData('/mua-ban/binh-duong/loai/dat-nen', { ...snapshot, rows: [] })).toBeNull();
    expect(buildLocalityPageData('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep', { ...snapshot, rows: [] })).not.toBeNull();
  });
  it('uses canonical short ward slugs for directory and distribution links', () => {
    const district = buildLocalityPageData('/mua-ban/binh-duong/di-an', snapshot)!;
    expect(district.links.wards[0]?.href).toBe('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep');
    const report = buildLocalityPageData('/mua-ban/binh-duong/di-an/thong-tin', snapshot)!;
    const ward = report.distributions.find(item => item.title.includes('phường'))!.rows.find(item => item.href)!;
    expect(ward.href).toBe('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep');
  });
  it('keeps sibling ward navigation on ward landing with parent-district counts', () => {
    const siblingSnapshot = {
      ...snapshot,
      wards: [
        ...snapshot.wards,
        { id: 'w2', district_id: 'd', slug: 'binh-duong-di-an-lai-thieu', name: 'Lái Thiêu' },
      ],
      rows: [
        ...snapshot.rows,
        { id: '6', title: 'Nhà Lái Thiêu', area_id: 'a', district_id: 'd', ward_id: 'w2', property_type_id: 't', listing_type: 'mua_ban', price: 2, price_unit: 'tỷ', price_per_month: null, area_sqm: 90 },
      ],
    };
    const ward = buildLocalityPageData('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep', siblingSnapshot)!;
    expect(ward.links.wards).toEqual([
      expect.objectContaining({ label: 'Tân Đông Hiệp', count: 5, active: true }),
      expect.objectContaining({ label: 'Lái Thiêu', count: 1, active: false }),
    ]);
  });

  it('does not advertise empty price bands and counts exact band rows', () => {
    const data = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    expect(data.links.prices.some(link => link.href.endsWith('duoi-1-ty'))).toBe(false);
    expect(data.links.prices.find(link => link.href.endsWith('tu-5-ty'))?.count).toBe(2);
  });
  it('leaves legacy transaction provinces noindex and query pages noindex', () => {
    const data = buildLocalityPageData('/mua-ban/binh-duong', snapshot)!;
    expect(buildLocalityMetadata(data).robots).toEqual({ index: false, follow: true });
    expect(buildLocalityMetadata(buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!, true).robots).toEqual({ index: false, follow: true });
  });
  it('links report distribution rows back to the same inventory, without forcing sale on mixed inventory', () => {
    const mixed = buildLocalityPageData('/khu-vuc/binh-duong/thong-tin', snapshot)!;
    const ward = mixed.distributions.find(item => item.title.includes('phường'))!.rows.find(item => item.href)!;
    const url = new URL(ward.href!, 'https://example.test');
    expect(url.pathname).toBe('/danh-sach');
    expect(url.searchParams.get('area')).toBe('a');
    expect(url.searchParams.get('ward')).toBe('Tân Đông Hiệp');
    const band = buildLocalityPageData('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty/thong-tin', snapshot)!;
    const type = band.distributions.find(item => item.title === 'Cơ cấu loại hình')!.rows[0];
    expect(type.href).toBe('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty?type=t');
  });
  it('uses report-methodology FAQ rather than duplicating landing questions', () => {
    const landing = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    const report = buildLocalityPageData('/khu-vuc/binh-duong/thong-tin', snapshot)!;
    expect(report.faq.map(item => item.question)).not.toEqual(landing.faq.map(item => item.question));
    expect(report.faq.some(item => item.answer.includes('giao dịch'))).toBe(true);
  });
});
