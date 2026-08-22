import { describe, expect, it } from 'vitest';
import { buildSearchVisibilityCandidates, summarizeSearchVisibility, SEARCH_VISIBILITY_CANONICAL_ORIGIN, type SearchVisibilityCandidate, type SearchVisibilitySources } from './searchVisibility';
import { classifySearchVisibilityPersistenceError, SEARCH_VISIBILITY_SOURCE_SELECTS, SearchVisibilitySyncError, validateSearchVisibilityCandidates } from './searchVisibilityService';

function sources(overrides: Partial<SearchVisibilitySources> = {}): SearchVisibilitySources {
  return {
    properties: [],
    areas: [],
    neighborhoods: [],
    news: [],
    newsCategories: [],
    managedPages: [],
    ...overrides,
  };
}

describe('buildSearchVisibilityCandidates', () => {
  it('chỉ cho property active có đủ phần URL canonical vào registry eligible', () => {
    const candidates = buildSearchVisibilityCandidates(sources({
      properties: [
        {
          id: 'p-ready', slug: 'nha-dep', public_code: 101, listing_type: 'mua_ban', district: 'Thuận An',
          is_active: true, updated_at: '2026-08-20T00:00:00.000Z', areas: { slug: 'binh-duong' },
        },
        {
          id: 'p-missing', slug: null, public_code: null, listing_type: 'mua_ban', district: null,
          is_active: true, updated_at: null, areas: { slug: 'binh-duong' },
        },
        {
          id: 'p-inactive', slug: 'da-an', public_code: 102, listing_type: 'mua_ban', district: null,
          is_active: false, updated_at: null, areas: { slug: 'binh-duong' },
        },
      ],
    }));

    expect(candidates.find(item => item.sourceKey === 'property:p-ready')).toMatchObject({
      eligible: true,
      reasonCode: 'ELIGIBLE',
      canonicalPath: '/mua-ban/binh-duong/thuan-an/nha-dep-pr101',
      canonicalUrl: 'https://chonhaviet.com/mua-ban/binh-duong/thuan-an/nha-dep-pr101',
    });
    expect(candidates.find(item => item.sourceKey === 'property:p-missing')).toMatchObject({
      eligible: false,
      reasonCode: 'MISSING_REQUIRED_SOURCE',
    });
    expect(candidates.find(item => item.sourceKey === 'property:p-inactive')).toMatchObject({
      eligible: false,
      reasonCode: 'INACTIVE_PROPERTY',
      canonicalPath: null,
    });
  });

  it('không cho draft news hoặc system/inactive managed page vào URL eligible', () => {
    const candidates = buildSearchVisibilityCandidates(sources({
      news: [
        { id: 'news-live', slug: 'bai-da-dang', is_published: true, updated_at: null },
        { id: 'news-draft', slug: 'bai-nhap', is_published: false, updated_at: null },
      ],
      managedPages: [
        { id: 'page-live', slug: 'chinh-sach', is_active: true, is_system: false, updated_at: null },
        { id: 'page-system', slug: 'noi-bo', is_active: true, is_system: true, updated_at: null },
        { id: 'page-hidden', slug: 'da-an', is_active: false, is_system: false, updated_at: null },
      ],
    }));

    expect(candidates.find(item => item.sourceKey === 'news:news-live')).toMatchObject({ eligible: true, canonicalPath: '/tin-tuc/bai-da-dang' });
    expect(candidates.find(item => item.sourceKey === 'news:news-draft')).toMatchObject({ eligible: false, reasonCode: 'UNPUBLISHED_NEWS' });
    expect(candidates.find(item => item.sourceKey === 'managed_page:page-live')).toMatchObject({ eligible: true, canonicalPath: '/trang/chinh-sach' });
    expect(candidates.find(item => item.sourceKey === 'managed_page:page-system')).toMatchObject({ eligible: false, reasonCode: 'UNSUPPORTED_ENTITY' });
    expect(candidates.find(item => item.sourceKey === 'managed_page:page-hidden')).toMatchObject({ eligible: false, reasonCode: 'UNSUPPORTED_ENTITY' });
  });

  it('đồng bộ quality gate area/neighborhood với sitemap và tạo listing route area khi eligible', () => {
    const properties = Array.from({ length: 5 }, (_, index) => ({
      id: `p-${index}`, slug: `nha-${index}`, public_code: index + 1, listing_type: 'mua_ban', district: 'Thuận An',
      is_active: true, updated_at: null, areas: { slug: 'binh-duong' }, neighborhood_slug: index < 3 ? 'viet-sing' : null,
    }));
    const candidates = buildSearchVisibilityCandidates(sources({
      properties,
      areas: [
        { id: 'area-1', name: 'Bình Dương', slug: 'binh-duong', description: 'Mô tả khu vực thật.', created_at: null },
        { id: 'area-2', name: 'Mỏng', slug: 'mong', description: null, created_at: null },
      ],
      neighborhoods: [
        { id: 'nb-1', name: 'Việt Sing', slug: 'viet-sing', description: 'Mô tả khu dân cư thật.', created_at: null },
        { id: 'nb-2', name: 'Thiếu dữ liệu', slug: 'thieu-du-lieu', description: null, created_at: null },
      ],
    }));

    expect(candidates.find(item => item.sourceKey === 'area:area-1')).toMatchObject({ eligible: true, canonicalPath: '/khu-vuc/binh-duong' });
    expect(candidates.find(item => item.sourceKey === 'area_listing:mua_ban:area-1')).toMatchObject({ eligible: true, canonicalPath: '/mua-ban/binh-duong' });
    expect(candidates.find(item => item.sourceKey === 'area_listing:cho_thue:area-1')).toMatchObject({ eligible: true, canonicalPath: '/cho-thue/binh-duong' });
    expect(candidates.find(item => item.sourceKey === 'area:area-2')).toMatchObject({ eligible: false, reasonCode: 'QUALITY_GATE_FAILED' });
    expect(candidates.find(item => item.sourceKey === 'neighborhood:nb-1')).toMatchObject({ eligible: true, canonicalPath: '/khu-dan-cu/viet-sing' });
    expect(candidates.find(item => item.sourceKey === 'neighborhood:nb-2')).toMatchObject({ eligible: false, reasonCode: 'QUALITY_GATE_FAILED' });
  });

  it('falls back to created_at for areas and neighborhoods without updated_at', () => {
    const createdAt = '2026-08-20T00:00:00.000Z';
    const properties = Array.from({ length: 5 }, (_, index) => ({
      id: `p-${index}`, slug: `nha-${index}`, public_code: index + 1, listing_type: 'mua_ban', district: 'Thuận An',
      is_active: true, updated_at: null, areas: { slug: 'binh-duong' }, neighborhood_slug: 'viet-sing',
    }));
    const candidates = buildSearchVisibilityCandidates(sources({
      properties,
      areas: [{ id: 'area-1', name: 'Bình Dương', slug: 'binh-duong', description: 'Mô tả khu vực thật.', created_at: createdAt }],
      neighborhoods: [{ id: 'nb-1', name: 'Việt Sing', slug: 'viet-sing', description: 'Mô tả khu dân cư thật.', created_at: createdAt }],
    }));

    expect(candidates.find(item => item.sourceKey === 'area:area-1')?.contentUpdatedAt).toBe(createdAt);
    expect(candidates.find(item => item.sourceKey === 'neighborhood:nb-1')?.contentUpdatedAt).toBe(createdAt);
  });

  it('queries only the production-supported area and neighborhood source columns', () => {
    expect(SEARCH_VISIBILITY_SOURCE_SELECTS.areas).toBe('id,name,slug,description,created_at');
    expect(SEARCH_VISIBILITY_SOURCE_SELECTS.neighborhoods).toBe('id,name,slug,description,created_at');
    expect(SEARCH_VISIBILITY_SOURCE_SELECTS.areas).not.toContain('updated_at');
    expect(SEARCH_VISIBILITY_SOURCE_SELECTS.neighborhoods).not.toContain('updated_at');
  });

  it('pins every audit URL to the approved canonical origin', () => {
    const candidates = buildSearchVisibilityCandidates(sources({
      properties: [{ id: 'p-1', slug: 'nha-dep', public_code: 1, listing_type: 'mua_ban', district: null, is_active: true, updated_at: null, areas: { slug: 'binh-duong' } }],
      news: [{ id: 'news-1', slug: 'bai-viet', is_published: true, updated_at: null }],
      managedPages: [{ id: 'page-1', slug: 'chinh-sach', is_active: true, is_system: false, updated_at: null }],
    }));

    for (const candidate of candidates.filter(item => item.canonicalPath)) {
      expect(candidate.canonicalUrl).toBe(`${SEARCH_VISIBILITY_CANONICAL_ORIGIN}${candidate.canonicalPath}`);
    }
  });

  it('blocks malformed canonical candidates before an audit upsert', () => {
    const malformed: SearchVisibilityCandidate = {
      sourceKey: 'news:bad', entityType: 'news', entityId: 'bad', eligible: true, reasonCode: 'ELIGIBLE', reasonDetail: null,
      canonicalPath: '/tin-tuc/bad?preview=1', canonicalUrl: 'https://preview.vercel.app/tin-tuc/bad?preview=1', contentUpdatedAt: null,
    };

    try {
      validateSearchVisibilityCandidates([malformed]);
      expect.unreachable('expected canonical validation to reject malformed URL');
    } catch (error) {
      expect(error).toBeInstanceOf(SearchVisibilitySyncError);
      expect((error as SearchVisibilitySyncError).code).toBe('CANONICAL_POLICY');
    }
  });

  it('phân loại constraint production để hướng dẫn repair migration', () => {
    const error = classifySearchVisibilityPersistenceError({ message: 'new row violates check constraint "search_visibility_url_absolute_canonical"' });
    expect(error).toMatchObject({ code: 'CANONICAL_CONSTRAINT' });
    expect(error.message).toContain('migration sửa constraint');
  });

  it('tổng hợp eligibility theo reason/entity mà không gán nhãn Google indexed', () => {
    const report = summarizeSearchVisibility(buildSearchVisibilityCandidates(sources({
      news: [{ id: 'news-draft', slug: 'bai-nhap', is_published: false, updated_at: null }],
    })));

    expect(report.eligible).toBeGreaterThan(0);
    expect(report.byReason.UNPUBLISHED_NEWS).toBe(1);
    expect(report.byEntity.news).toEqual({ eligible: 0, excluded: 1 });
  });
});
