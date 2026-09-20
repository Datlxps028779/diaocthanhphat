import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const syncSearchVisibilityAuditMock = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock, revalidateTag: revalidateTagMock }));
vi.mock('./requireAdmin', () => ({ adminClient: adminClientMock }));
vi.mock('./searchVisibilityService', () => ({ syncSearchVisibilityAudit: syncSearchVisibilityAuditMock }));

import { propagatePublicIndexing, LOCALITY_SNAPSHOT_TAG } from './publicIndexing';

const lookups = {
  areaSlugs: new Map([['area-1', 'binh-duong']]),
  categorySlugs: new Map([['Thị trường', 'thi-truong']]),
  districtSlugs: new Map([['district-1', { areaId: 'area-1', slug: 'di-an' }]]),
  propertyTypeSlugs: new Map([['type-1', 'dat-nen']]),
};

function propertyContent(isActive = true) {
  return {
    entity: 'property' as const,
    action: 'update' as const,
    targets: [{ current: {
      id: 'property-1', slug: 'nha-dep', public_code: 101, listing_type: 'mua_ban' as const,
      district: 'Dĩ An', district_id: 'district-1', property_type_id: 'type-1',
      area_id: 'area-1', is_active: isActive,
    } }],
  };
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  revalidateTagMock.mockReset();
  adminClientMock.mockReset();
  syncSearchVisibilityAuditMock.mockReset();
  adminClientMock.mockReturnValue({
    from: vi.fn(() => ({ upsert: vi.fn(async () => ({ error: null })) })),
  });
  syncSearchVisibilityAuditMock.mockResolvedValue({ runId: 'run-1', summary: { total: 1, eligible: 1, excluded: 0, byReason: {}, byEntity: {} } });
});

describe('propagatePublicIndexing — tag snapshot địa phương', () => {
  it('tin đăng active đổi → làm mới tag snapshot bằng ĐÚNG literal cố định', async () => {
    await propagatePublicIndexing({ content: propertyContent(), lookups, actorId: 'owner-1' });

    expect(revalidateTagMock).toHaveBeenCalledWith(LOCALITY_SNAPSHOT_TAG);
    expect(LOCALITY_SNAPSHOT_TAG).toBe('public-locality-snapshot');
    // Chốt khớp literal với tag của loader core (không import core ở đây để giữ mock nhẹ).
    const coreTag = readFileSync(new URL('./localitySnapshot.ts', import.meta.url), 'utf8');
    expect(coreTag).toContain(`LOCALITY_SNAPSHOT_CACHE_TAG = '${LOCALITY_SNAPSHOT_TAG}'`);
  });

  it('tin active chuyển sang ẩn/expire vẫn purge snapshot theo trạng thái trước', async () => {
    const inactive = {
      entity: 'property' as const,
      action: 'unpublish' as const,
      targets: [{ previous: propertyContent().targets[0].current, current: { ...propertyContent().targets[0].current, is_active: false } }],
    };
    await propagatePublicIndexing({ content: inactive, lookups, actorId: 'owner-1' });
    // previous vẫn active nên có public impact → vẫn phải purge (tin rời khỏi public).
    expect(revalidateTagMock).toHaveBeenCalledWith(LOCALITY_SNAPSHOT_TAG);
  });

  it('bản nháp News không public impact → không purge snapshot', async () => {
    await propagatePublicIndexing({
      content: { entity: 'news', action: 'create', targets: [{ current: { id: 'n1', slug: 'nhap', category: null, is_published: false } }] },
      lookups,
      actorId: 'owner-1',
    });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('không cho client truyền tag tùy ý — chỉ dùng literal cố định', async () => {
    await propagatePublicIndexing({ content: propertyContent(), lookups, actorId: 'owner-1' });
    for (const call of revalidateTagMock.mock.calls) {
      expect(call[0]).toBe('public-locality-snapshot');
    }
  });
});
