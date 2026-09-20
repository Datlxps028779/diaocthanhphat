import { describe, expect, it } from 'vitest';
import {
  PRICE_BANDS,
  buildLocalityPagePath,
  buildLocalitySitemapCandidates,
  priceBandFromVnd,
  resolveLocalityPageContext,
  type LocalityTaxonomy,
} from './localityPageContext';

// Fixture taxonomy mirrors real parent/child relations so a valid path is only
// resolvable when area → district → ward actually belong together.
const taxonomy: LocalityTaxonomy = {
  areas: [
    { id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương' },
    { id: 'a-bp', slug: 'binh-phuoc', name: 'Bình Phước' },
  ],
  districts: [
    { id: 'd-di-an', area_id: 'a-bd', slug: 'binh-duong-di-an', name: 'Dĩ An' },
    { id: 'd-dong-xoai', area_id: 'a-bp', slug: 'binh-phuoc-dong-xoai', name: 'Đồng Xoài' },
  ],
  wards: [
    { id: 'w-tan-dong-hiep', district_id: 'd-di-an', slug: 'binh-duong-di-an-tan-dong-hiep', name: 'Tân Đông Hiệp' },
    { id: 'w-tan-phu', district_id: 'd-dong-xoai', slug: 'binh-phuoc-dong-xoai-tan-phu', name: 'Tân Phú' },
  ],
  propertyTypes: [
    { id: 'pt-nha-pho', slug: 'nha-pho', name: 'Nhà phố' },
    { id: 'pt-dat-nen', slug: 'dat-nen', name: 'Đất nền' },
    { id: 'pt-dat-mau', slug: 'dat-mau-dat-sao', name: 'Đất mẫu đất sao' },
    { id: 'pt-day-tro', slug: 'day-tro', name: 'Dãy trọ' },
    { id: 'pt-can-ho', slug: 'can-ho-chung-cu', name: 'Căn hộ chung cư' },
  ],
};

const resolve = (pathname: string) => resolveLocalityPageContext(pathname, taxonomy);

describe('resolveLocalityPageContext — legacy shapes', () => {
  it('resolves the province commerical landing and its report', () => {
    const landing = resolve('/mua-ban/binh-duong');
    expect(landing).toMatchObject({
      mode: 'landing',
      listingType: 'mua_ban',
      areaId: 'a-bd',
      areaSlug: 'binh-duong',
      districtId: null,
      wardId: null,
      propertyGroup: null,
      priceBand: null,
      path: '/mua-ban/binh-duong',
      reportPath: '/mua-ban/binh-duong/thong-tin',
    });
    expect(landing?.title).toContain('Bình Dương');

    expect(resolve('/mua-ban/binh-duong/thong-tin')).toMatchObject({
      mode: 'report',
      listingType: 'mua_ban',
      areaId: 'a-bd',
      // Report path mang ĐÚNG một suffix; landingPath giữ URL landing để dựng sitemap.
      path: '/mua-ban/binh-duong/thong-tin',
      landingPath: '/mua-ban/binh-duong',
      reportPath: '/mua-ban/binh-duong/thong-tin',
    });
  });

  it('resolves district and existing district+exact-type paths with legacy slugs', () => {
    expect(resolve('/cho-thue/binh-duong/di-an')).toMatchObject({
      listingType: 'cho_thue', areaId: 'a-bd', districtId: 'd-di-an', propertyGroup: null,
    });
    // "nha" is the legacy SEO group alias, not a property_types.slug. When the group
    // maps to exactly one property type, the resolver also pins that type id.
    expect(resolve('/mua-ban/binh-duong/di-an/nha')).toMatchObject({
      listingType: 'mua_ban', areaId: 'a-bd', districtId: 'd-di-an', propertyGroup: 'nha', propertyTypeId: 'pt-nha-pho',
    });
    expect(resolve('/mua-ban/binh-duong/di-an/dat')).toMatchObject({ propertyGroup: 'dat' });
    expect(resolve('/mua-ban/binh-duong/di-an/day-tro')).toMatchObject({ propertyGroup: 'day-tro' });
  });

  it('resolves the province overview page as a landing without a listing type', () => {
    expect(resolve('/khu-vuc/binh-duong')).toMatchObject({
      mode: 'landing', listingType: null, areaId: 'a-bd', path: '/khu-vuc/binh-duong', reportPath: '/khu-vuc/binh-duong/thong-tin',
    });
    expect(resolve('/khu-vuc/binh-duong/thong-tin')).toMatchObject({ mode: 'report', listingType: null, areaId: 'a-bd' });
  });
});

describe('resolveLocalityPageContext — new namespaced shapes', () => {
  it('resolves province-wide loai (type group) and gia (price band) landings', () => {
    expect(resolve('/mua-ban/binh-duong/loai/nha')).toMatchObject({
      mode: 'landing', listingType: 'mua_ban', areaId: 'a-bd',
      districtId: null, propertyGroup: 'nha', propertyTypeId: 'pt-nha-pho', priceBand: null,
      path: '/mua-ban/binh-duong/loai/nha',
    });
    expect(resolve('/mua-ban/binh-duong/loai/nha/thong-tin')).toMatchObject({ mode: 'report', propertyGroup: 'nha' });
    expect(resolve('/mua-ban/binh-duong/gia/tu-2-den-duoi-5-ty')).toMatchObject({
      mode: 'landing', priceBand: 'tu-2-den-duoi-5-ty', propertyGroup: null, districtId: null,
    });
    expect(resolve('/cho-thue/binh-duong/loai/day-tro')).toMatchObject({ listingType: 'cho_thue', propertyGroup: 'day-tro' });
    // "dat" maps to two property types, so the group stays the filter and no single id is pinned.
    expect(resolve('/mua-ban/binh-duong/loai/dat')).toMatchObject({ propertyGroup: 'dat', propertyTypeId: null });
  });

  it('resolves an EXACT taxonomy type slug in both the legacy and namespaced shapes', () => {
    // Legacy {d}/{t} with a real property_types.slug.
    expect(resolve('/mua-ban/binh-duong/di-an/nha-pho')).toMatchObject({
      districtId: 'd-di-an', propertyGroup: 'nha', propertyTypeIds: ['pt-nha-pho'], propertyTypeId: 'pt-nha-pho',
      typeSegmentIsGroup: false, typeNamespaced: false,
      path: '/mua-ban/binh-duong/di-an/nha-pho',
    });
    // /loai/{t} accepts the same exact slug at province level.
    expect(resolve('/mua-ban/binh-duong/loai/nha-pho')).toMatchObject({
      districtId: null, propertyGroup: 'nha', propertyTypeIds: ['pt-nha-pho'],
      typeSegmentIsGroup: false, typeNamespaced: true,
      path: '/mua-ban/binh-duong/loai/nha-pho',
    });
    // A group segment is flagged distinctly from an exact slug.
    expect(resolve('/mua-ban/binh-duong/loai/nha')).toMatchObject({ typeSegmentIsGroup: true });
  });

  it('rejects a price band on a rent path — rent has no price-band landing', () => {
    expect(resolve('/cho-thue/binh-duong/gia/tu-5-ty')).toBeNull();
    expect(resolve('/cho-thue/binh-duong/gia/duoi-1-ty')).toBeNull();
    // Sale keeps the band.
    expect(resolve('/mua-ban/binh-duong/gia/tu-5-ty')).toMatchObject({ priceBand: 'tu-5-ty' });
  });

  it('resolves a ward landing only when area → district → ward all match', () => {
    expect(resolve('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep')).toMatchObject({
      mode: 'landing', areaId: 'a-bd', districtId: 'd-di-an', wardId: 'w-tan-dong-hiep',
      propertyGroup: null, priceBand: null,
      path: '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep',
      reportPath: '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep/thong-tin',
    });
    // Ward of another province's district must not resolve under this province.
    expect(resolve('/mua-ban/binh-duong/di-an/phuong-xa/tan-phu')).toBeNull();
    expect(resolve('/mua-ban/binh-phuoc/di-an/phuong-xa/tan-dong-hiep')).toBeNull();
  });

  it('names only the exact type for an exact slug, and every member for a group', () => {
    // nha-pho is a member of group "nha"; the title must say the exact type, not the group roll-up.
    expect(resolve('/mua-ban/binh-duong/di-an/nha-pho')?.title).toContain('Nhà phố');
    // The group names its members from taxonomy.
    expect(resolve('/mua-ban/binh-duong/di-an/nha')?.title).toContain('Nhà phố');
    // "dat" must list BOTH member type names, not just the first.
    const datTitle = resolve('/mua-ban/binh-duong/loai/dat')?.title ?? '';
    expect(datTitle).toContain('Đất nền');
    expect(datTitle).toContain('Đất mẫu đất sao');
  });

  it('distinguishes sale and rent in report titles', () => {
    expect(resolve('/mua-ban/binh-duong/thong-tin')?.title).toContain('mua bán');
    expect(resolve('/cho-thue/binh-duong/thong-tin')?.title).toContain('cho thuê');
    expect(resolve('/khu-vuc/binh-duong/thong-tin')?.title).toContain('Báo cáo');
  });

  it('resolves a ward landing with its report suffix', () => {
    expect(resolve('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep/thong-tin')).toMatchObject({
      mode: 'report', wardId: 'w-tan-dong-hiep',
      path: '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep/thong-tin',
      landingPath: '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep',
    });
  });

  it('keeps report path and landingPath distinct and never double-suffixes', () => {
    for (const reportPathname of [
      '/khu-vuc/binh-duong/thong-tin',
      '/mua-ban/binh-duong/thong-tin',
      '/mua-ban/binh-duong/loai/nha/thong-tin',
      '/mua-ban/binh-duong/gia/tu-5-ty/thong-tin',
      '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep/thong-tin',
    ]) {
      const report = resolve(reportPathname)!;
      expect(report.mode, reportPathname).toBe('report');
      // `path` chính là URL đã resolve — round-trip qua build phải khớp chính nó.
      expect(report.path, reportPathname).toBe(reportPathname);
      expect(report.path.endsWith('/thong-tin'), reportPathname).toBe(true);
      expect(report.path.includes('thong-tin/thong-tin'), reportPathname).toBe(false);
      // landingPath bỏ đúng một suffix và là landing mode khi resolve lại.
      expect(report.landingPath, reportPathname).toBe(reportPathname.replace(/\/thong-tin$/, ''));
      expect(report.reportPath, reportPathname).toBe(reportPathname);
      const landing = resolve(report.landingPath)!;
      expect(landing.mode, reportPathname).toBe('landing');
      expect(landing.path, reportPathname).toBe(report.landingPath);
      // Metadata/URL round-trip: dựng lại từ context phải ra đúng path của chính nó.
      expect(buildLocalityPagePath({ ...report }), reportPathname).toBe(reportPathname);
      expect(buildLocalityPagePath({ ...landing }), reportPathname).toBe(report.landingPath);
    }
  });
});

describe('resolveLocalityPageContext — rejection', () => {
  it.each([
    ['unknown listing folder', '/dat-nen/binh-duong'],
    ['unknown province', '/mua-ban/khong-ton-tai'],
    ['district from another province', '/mua-ban/binh-duong/dong-xoai'],
    ['unknown district', '/mua-ban/binh-duong/khong-co'],
    ['unknown type group', '/mua-ban/binh-duong/loai/khong-co'],
    ['unknown exact type segment', '/mua-ban/binh-duong/di-an/khong-co'],
    ['unknown price band', '/mua-ban/binh-duong/gia/khong-co'],
    ['price band on a district path', '/mua-ban/binh-duong/di-an/gia/tu-5-ty'],
    ['loai under a district', '/mua-ban/binh-duong/di-an/loai/nha'],
    ['phuong-xa without a ward', '/mua-ban/binh-duong/di-an/phuong-xa'],
    ['too many trailing segments', '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep/them'],
    ['report suffix alone', '/thong-tin'],
    ['empty segments', '/mua-ban//binh-duong'],
    ['ungrouped property type at province scope', '/mua-ban/binh-duong/can-ho-chung-cu'],
  ])('returns null for %s', (_label, pathname) => {
    expect(resolve(pathname)).toBeNull();
  });

  it('returns null for an empty or non-path input', () => {
    expect(resolve('')).toBeNull();
    expect(resolve('/')).toBeNull();
  });

  it('does not treat a product suffix path as a locality context', () => {
    // Product detail paths live outside the listing folder and are not locality pages.
    expect(resolve('/bat-dong-san/nha-pho-abc-pr12345')).toBeNull();
  });
});

describe('price bands', () => {
  it('exposes the four fixed, non-overlapping VND bands', () => {
    expect(PRICE_BANDS.map(b => b.id)).toEqual(['duoi-1-ty', 'tu-1-den-duoi-2-ty', 'tu-2-den-duoi-5-ty', 'tu-5-ty']);
    expect(PRICE_BANDS[0].maxVnd).toBeLessThan(PRICE_BANDS[1].maxVnd ?? Infinity);
  });

  it('assigns boundary values without overlap', () => {
    expect(priceBandFromVnd(999_999_999)).toBe('duoi-1-ty');
    expect(priceBandFromVnd(1_000_000_000)).toBe('tu-1-den-duoi-2-ty');
    expect(priceBandFromVnd(1_999_999_999)).toBe('tu-1-den-duoi-2-ty');
    expect(priceBandFromVnd(2_000_000_000)).toBe('tu-2-den-duoi-5-ty');
    expect(priceBandFromVnd(4_999_999_999)).toBe('tu-2-den-duoi-5-ty');
    expect(priceBandFromVnd(5_000_000_000)).toBe('tu-5-ty');
  });

  it('returns null for a non-price value instead of a default band', () => {
    expect(priceBandFromVnd(0)).toBeNull();
    expect(priceBandFromVnd(-1)).toBeNull();
    expect(priceBandFromVnd(Number.NaN)).toBeNull();
    expect(priceBandFromVnd(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('buildLocalityPagePath', () => {
  it('round-trips every resolvable shape', () => {
    for (const pathname of [
      '/khu-vuc/binh-duong',
      '/mua-ban/binh-duong',
      '/mua-ban/binh-duong/di-an',
      '/mua-ban/binh-duong/di-an/nha',
      '/mua-ban/binh-duong/loai/nha',
      '/mua-ban/binh-duong/gia/tu-5-ty',
      '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep',
    ]) {
      const context = resolve(pathname);
      expect(context, pathname).not.toBeNull();
      expect(buildLocalityPagePath(context!), pathname).toBe(pathname);
    }
  });
});

describe('buildLocalitySitemapCandidates', () => {
  it('enumerates only the bounded landing families, never the full cross product', () => {
    const paths = buildLocalitySitemapCandidates(taxonomy).map(c => c.path);
    // Province overview + sale/rent landings.
    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/mua-ban/binh-duong');
    expect(paths).toContain('/cho-thue/binh-duong');
    // District landing is legacy-scoped.
    expect(paths).toContain('/mua-ban/binh-duong/di-an');
    // Type group at province scope.
    expect(paths).toContain('/mua-ban/binh-duong/loai/nha');
    // Price band at province scope.
    expect(paths).toContain('/mua-ban/binh-duong/gia/duoi-1-ty');
    // Ward landing.
    expect(paths).toContain('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep');
    // No district × type × price cross product.
    expect(paths.some(p => p.includes('/di-an/loai/'))).toBe(false);
    expect(paths.some(p => p.includes('/gia/') && p.includes('/di-an/'))).toBe(false);
    expect(paths.some(p => p.includes('/phuong-xa/') && p.includes('/loai/'))).toBe(false);
    // Report paths are never emitted as sitemap candidates.
    expect(paths.some(p => p.endsWith('/thong-tin'))).toBe(false);
    // Every candidate resolves back to a landing context.
    for (const candidate of buildLocalitySitemapCandidates(taxonomy)) {
      expect(candidate.mode).toBe('landing');
      expect(resolve(candidate.path)?.path).toBe(candidate.path);
    }
  });

  it('enumerates exact province type slugs alongside the fixed groups', () => {
    const paths = buildLocalitySitemapCandidates(taxonomy).map(c => c.path);
    for (const slug of ['nha-pho', 'dat-nen', 'dat-mau-dat-sao', 'day-tro', 'can-ho-chung-cu']) {
      expect(paths, slug).toContain(`/mua-ban/binh-duong/loai/${slug}`);
      expect(paths, slug).toContain(`/cho-thue/binh-duong/loai/${slug}`);
    }
    // Each exact-type candidate must resolve to a single pinned type id.
    const exact = buildLocalitySitemapCandidates(taxonomy).find(c => c.path === '/mua-ban/binh-duong/loai/nha-pho');
    expect(exact?.propertyTypeIds).toEqual(['pt-nha-pho']);
    expect(exact?.typeSegmentIsGroup).toBe(false);
  });

  it('never enumerates a rent price band', () => {
    const paths = buildLocalitySitemapCandidates(taxonomy).map(c => c.path);
    expect(paths.some(p => p.startsWith('/cho-thue/') && p.includes('/gia/'))).toBe(false);
  });
});
