import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePathMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const syncSearchVisibilityAuditMock = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('./requireAdmin', () => ({ adminClient: adminClientMock }));
vi.mock('./searchVisibilityService', () => ({ syncSearchVisibilityAudit: syncSearchVisibilityAuditMock }));

import { propagatePublicIndexing } from './publicIndexing';

const lookups = {
  areaSlugs: new Map([['area-1', 'binh-duong']]),
  categorySlugs: new Map([['Thị trường', 'thi-truong']]),
  districtSlugs: new Map([['district-1', { areaId: 'area-1', slug: 'di-an' }]]),
  propertyTypeSlugs: new Map([['type-1', 'dat-nen']]),
};

function content(overrides: Record<string, unknown> = {}) {
  return {
    entity: 'news' as const,
    action: 'publish' as const,
    targets: [{ current: {
      id: 'news-1', slug: 'bai-viet-moi', category: 'Thị trường', is_published: true,
      ...overrides,
    } }],
  };
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  adminClientMock.mockReset();
  syncSearchVisibilityAuditMock.mockReset();
  adminClientMock.mockReturnValue({
    from: vi.fn(() => ({ upsert: vi.fn(async () => ({ error: null })) })),
  });
  syncSearchVisibilityAuditMock.mockResolvedValue({ runId: 'run-1', summary: { total: 1, eligible: 1, excluded: 0, byReason: {}, byEntity: {} } });
});

describe('propagatePublicIndexing', () => {
  it('revalidates, queues freshness, and syncs deterministic visibility for published News', async () => {
    const result = await propagatePublicIndexing({ content: content(), lookups, actorId: 'owner-1' });

    expect(result.paths).toContain('/tin-tuc/bai-viet-moi');
    expect(result.paths).toContain('/sitemap.xml');
    expect(result.paths).toContain('/sitemap-images.xml');
    expect(revalidatePathMock).toHaveBeenCalledWith('/tin-tuc/bai-viet-moi');
    expect(result.freshness).toMatchObject({ status: 'succeeded', queuedCount: result.paths.length });
    expect(result.searchVisibility).toMatchObject({ status: 'succeeded', runId: 'run-1' });
    expect(syncSearchVisibilityAuditMock).toHaveBeenCalledWith('owner-1');
  });

  it('propagates an active Product to detail, taxonomy, both sitemaps, queue, and registry sync', async () => {
    const result = await propagatePublicIndexing({
      content: {
        entity: 'property', action: 'publish', targets: [{ current: {
          id: 'property-1', slug: 'nha-dep', public_code: 101, listing_type: 'mua_ban',
          district: 'Dĩ An', district_id: 'district-1', property_type_id: 'type-1',
          area_id: 'area-1', neighborhood_slug: 'tan-binh', is_active: true,
          updated_at: '2026-09-11T10:00:00.000Z',
        } }],
      },
      lookups,
      actorId: 'owner-1',
    });

    expect(result.paths).toContain('/mua-ban/binh-duong/di-an/nha-dep-pr101');
    expect(result.paths).toContain('/khu-dan-cu/tan-binh');
    expect(result.paths).toContain('/sitemap-images.xml');
    expect(result.searchVisibility.status).toBe('succeeded');
    expect(syncSearchVisibilityAuditMock).toHaveBeenCalledWith('owner-1');
  });

  it('does not run visibility sync for a draft News create', async () => {
    const result = await propagatePublicIndexing({
      content: { entity: 'news', action: 'create', targets: [{ current: { id: 'news-1', slug: 'ban-nhap', category: 'Thị trường', is_published: false } }] },
      lookups,
      actorId: 'owner-1',
    });

    expect(result.paths).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(syncSearchVisibilityAuditMock).not.toHaveBeenCalled();
    expect(result.searchVisibility.status).toBe('skipped');
  });

  it('không báo queue thành công khi server chưa có service role', async () => {
    adminClientMock.mockReturnValue(null);
    const result = await propagatePublicIndexing({ content: content(), lookups, actorId: 'owner-1' });
    expect(result.freshness).toMatchObject({ status: 'skipped', queuedCount: 0 });
    expect(result.freshness.error).toContain('freshness queue');
  });

  it('trả evidence degraded thay vì giả vờ hoàn tất khi queue hoặc registry lỗi', async () => {
    adminClientMock.mockReturnValue({
      from: vi.fn(() => ({ upsert: vi.fn(async () => ({ error: new Error('queue down') })) })),
    });
    syncSearchVisibilityAuditMock.mockRejectedValue(new Error('registry down'));

    const result = await propagatePublicIndexing({ content: content(), lookups, actorId: 'owner-1' });

    expect(result.freshness).toMatchObject({ status: 'degraded', queuedCount: 0, error: 'queue down' });
    expect(result.searchVisibility).toMatchObject({ status: 'degraded', error: 'registry down' });
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});
