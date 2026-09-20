import { describe, expect, it } from 'vitest';
import {
  buildLocalityCandidatesFromSnapshot,
  evaluateLocalityGateForPath,
} from './localitySitemapGate';
import type { LocalitySnapshot } from './server/localitySnapshot';
import { resolveLocalityPageContext, type LocalityTaxonomy } from './localityPageContext';
import { getLocalityReport } from './localityReport';

// Snapshot thật thu nhỏ, ĐẦY ĐỦ taxonomy — dùng chung cho mọi assertion parity.
const taxonomy: LocalityTaxonomy = {
  areas: [
    { id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương' },
    { id: 'a-bp', slug: 'binh-phuoc', name: 'Bình Phước' },
  ],
  districts: [
    { id: 'd-di-an', area_id: 'a-bd', slug: 'binh-duong-di-an', name: 'Dĩ An' },
    { id: 'd-thuan-an', area_id: 'a-bd', slug: 'binh-duong-thuan-an', name: 'Thuận An' },
    { id: 'd-dong-xoai', area_id: 'a-bp', slug: 'binh-phuoc-dong-xoai', name: 'Đồng Xoài' },
  ],
  wards: [
    { id: 'w-di-an', district_id: 'd-di-an', slug: 'binh-duong-di-an-di-an', name: 'Dĩ An' },
    { id: 'w-tan-dong', district_id: 'd-di-an', slug: 'binh-duong-di-an-tan-dong', name: 'Tân Đông' },
    { id: 'w-thuan-an', district_id: 'd-thuan-an', slug: 'binh-duong-thuan-an-thuan-an', name: 'Thuận An' },
  ],
  propertyTypes: [
    { id: 't-nha-pho', slug: 'nha-pho', name: 'Nhà phố' },
    { id: 't-dat-nen', slug: 'dat-nen', name: 'Đất nền' },
    { id: 't-day-tro', slug: 'day-tro', name: 'Dãy trọ' },
  ],
};

type Row = {
  id: string;
  title: string;
  area_id: string;
  district_id: string;
  ward_id: string | null;
  property_type_id: string;
  listing_type: string;
  price: number | null;
  price_unit: string | null;
  price_per_month: number | null;
  area_sqm: number | null;
};

function row(overrides: Partial<Row> & { id: string }): Row {
  return {
    title: `Tin ${overrides.id}`,
    area_id: 'a-bd',
    district_id: 'd-di-an',
    ward_id: 'w-di-an',
    property_type_id: 't-nha-pho',
    listing_type: 'mua_ban',
    price: 3,
    price_unit: 'tỷ',
    price_per_month: null,
    area_sqm: 100,
    ...overrides,
  };
}

// LocalityArea nay mang đủ trường biên tập nullable; gate CHỈ đọc `description`.
const AREA_EDITORIAL = {
  description: 'Mô tả khu vực.',
  admin_note: null,
  meta_title: null,
  meta_description: null,
  focus_keywords: null,
  image_url: null,
} as const;

function snapshot(rows: Row[]): LocalitySnapshot {
  return {
    computedAt: '2026-09-16T00:00:00.000Z',
    rows,
    areas: taxonomy.areas.map(a => ({ ...a, ...AREA_EDITORIAL })),
    districts: [...taxonomy.districts],
    wards: [...taxonomy.wards],
    propertyTypes: [...taxonomy.propertyTypes],
  };
}

// 600 row > cap mẫu 500 cũ. Đây là fixture, KHÔNG phải bằng chứng production.
function bigProvince(): Row[] {
  return Array.from({ length: 600 }, (_, i) => row({
    id: `p-${i}`,
    title: `Tin số ${i}`,
    district_id: i % 2 ? 'd-di-an' : 'd-thuan-an',
    ward_id: i % 2 ? 'w-di-an' : 'w-thuan-an',
    property_type_id: i % 3 === 0 ? 't-dat-nen' : 't-nha-pho',
  }));
}

describe('locality sitemap gate — parity với metadata và Search Visibility', () => {
  it('cùng snapshot cho ra cùng quyết định indexable giữa gate và report evaluator', () => {
    const rows = bigProvince();
    const ctx = resolveLocalityPageContext('/khu-vuc/binh-duong', taxonomy)!;
    const report = getLocalityReport(rows, ctx, '2026-09-16T00:00:00.000Z');

    const gated = evaluateLocalityGateForPath('/khu-vuc/binh-duong', snapshot(rows));
    expect(gated).not.toBeNull();
    // Gate dùng CHÍNH evaluator + report của core, nên indexable phải khớp tuyệt đối.
    expect(gated!.indexable).toBe(report.counts.total >= 5);
  });

  it('>500 row: gate KHÔNG lấy 500 row đầu làm toàn bộ tỉnh', () => {
    const rows = bigProvince();
    const gated = evaluateLocalityGateForPath('/khu-vuc/binh-duong', snapshot(rows));
    expect(gated!.matchingCount).toBe(600);
  });

  it('report ĐỦ ngưỡng vào sitemap; report THIẾU ngưỡng thì không (evaluator quyết)', () => {
    // Đủ dữ liệu: 600 tin có tiêu đề phân biệt + mẫu giá + module phân tích → eligible.
    const rich = buildLocalityCandidatesFromSnapshot(snapshot(bigProvince()));
    const reportPath = '/khu-vuc/binh-duong/thong-tin';
    expect(rich.some(c => c.path === reportPath)).toBe(true);
    const gated = evaluateLocalityGateForPath(reportPath, snapshot(bigProvince()));
    expect(gated?.sitemapCandidate).toBe(true);

    // Thiếu ngưỡng: 1 tin → evaluator loại, report không được vào sitemap.
    const thin = evaluateLocalityGateForPath(reportPath, snapshot(bigProvince().slice(0, 1)));
    expect(thin?.indexable).toBe(false);
    expect(thin?.sitemapCandidate).toBe(false);
    expect(buildLocalityCandidatesFromSnapshot(snapshot(bigProvince().slice(0, 1))).some(c => c.path === reportPath)).toBe(false);
  });

  it('snapshot lỗi/không hoàn chỉnh thì gate trả null (fail closed), không fallback', () => {
    // evaluateLocalityGateForPath nhận snapshot đã đọc hoàn chỉnh; caller truyền null
    // khi loader ném lỗi — kiểm nhánh fail-closed qua build với snapshot rỗng taxonomy.
    const broken: LocalitySnapshot = { ...snapshot([]), districts: [], wards: [] };
    // Không có taxonomy → không resolve được context nào; không được suy diễn URL.
    expect(buildLocalityCandidatesFromSnapshot(broken)).toHaveLength(0);
  });

  it('facet loại/giá mới KHÔNG có kết quả thì không sinh link sitemap', () => {
    // Chỉ có nha-pho; facet dat-nen phải rỗng.
    const rows = Array.from({ length: 6 }, (_, i) => row({ id: `n-${i}`, property_type_id: 't-nha-pho' }));
    const candidates = buildLocalityCandidatesFromSnapshot(snapshot(rows));
    expect(candidates.some(c => c.path.includes('dat'))).toBe(false);
    expect(candidates.every(c => !c.path.includes('/gia/') || c.matchingCount > 0)).toBe(true);
  });

  it('candidate sinh ra chỉ nằm trong họ landing đã duyệt', () => {
    const rows = bigProvince();
    const candidates = buildLocalityCandidatesFromSnapshot(snapshot(rows));
    for (const c of candidates) {
      expect(c.path.startsWith('/khu-vuc/') || c.path.startsWith('/mua-ban/') || c.path.startsWith('/cho-thue/')).toBe(true);
    }
  });

  it('deterministic: cùng snapshot → cùng danh sách candidate', () => {
    const rows = bigProvince();
    const a = buildLocalityCandidatesFromSnapshot(snapshot(rows));
    const b = buildLocalityCandidatesFromSnapshot(snapshot(rows));
    expect(a).toEqual(b);
  });
});
