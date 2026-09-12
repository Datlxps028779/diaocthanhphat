import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminClientMock = vi.hoisted(() => vi.fn());
vi.mock('./requireAdmin', () => ({ adminClient: adminClientMock }));

import { aiIndexTargetForContent, aiIndexTargetsForContent, refreshAiIndex, RAG_DEFERRED_MESSAGE } from './aiIndexing';

describe('aiIndexing', () => {
  beforeEach(() => {
    adminClientMock.mockReset();
    vi.stubEnv('AIO_RAG_MODE', '');
    vi.stubEnv('PUBLIC_AIO_RAG_MODE', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('maps public entities to their RAG source', () => {
    expect(aiIndexTargetForContent({ entity: 'property', action: 'update', targets: [] })).toBe('properties');
    expect(aiIndexTargetForContent({ entity: 'news', action: 'update', targets: [] })).toBe('news');
    expect(aiIndexTargetForContent({ entity: 'area', action: 'update', targets: [] })).toBe('areas');
    expect(aiIndexTargetsForContent({ entity: 'area', action: 'update', targets: [] })).toEqual(['areas', 'properties', 'price_stats']);
    expect(aiIndexTargetForContent({ entity: 'neighborhood', action: 'update', targets: [] })).toBe('neighborhoods');
    expect(aiIndexTargetForContent({ entity: 'route', action: 'update', targets: [] })).toBe('managed_pages');
  });

  it('defers RAG by default without calling the server RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 7, error: null });
    adminClientMock.mockReturnValue({ rpc });

    const result = await refreshAiIndex({
      content: { entity: 'news', action: 'publish', targets: [] },
      shouldRefresh: true,
    });

    expect(adminClientMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'skipped', target: 'news', targets: ['news'], indexedCount: 0, error: RAG_DEFERRED_MESSAGE });
  });

  it('refreshes the mapped source only when explicitly enabled', async () => {
    vi.stubEnv('AIO_RAG_MODE', 'enabled');
    const rpc = vi.fn().mockResolvedValue({ data: 7, error: null });
    adminClientMock.mockReturnValue({ rpc });

    const result = await refreshAiIndex({
      content: { entity: 'news', action: 'publish', targets: [] },
      shouldRefresh: true,
    });

    expect(rpc).toHaveBeenCalledWith('refresh_rag_index', { target: 'news' });
    expect(result).toEqual({ status: 'succeeded', target: 'news', targets: ['news'], indexedCount: 7, error: null });
  });

  it('refreshes the full projection for route/SEO content when explicitly enabled', async () => {
    vi.stubEnv('AIO_RAG_MODE', 'enabled');
    const rpc = vi.fn().mockResolvedValue({ data: 12, error: null });
    adminClientMock.mockReturnValue({ rpc });

    const result = await refreshAiIndex({
      content: { entity: 'route', action: 'update', targets: [{ current: { path: '/tin-tuc' } }] },
      shouldRefresh: true,
    });

    expect(rpc).toHaveBeenCalledWith('refresh_rag_index', { target: 'managed_pages' });
    expect(result.target).toBe('managed_pages');
    expect(result.targets).toEqual(['managed_pages']);
  });

  it('does not call the server for drafts or hidden records', async () => {
    adminClientMock.mockReturnValue({ rpc: vi.fn() });
    const result = await refreshAiIndex({
      content: { entity: 'news', action: 'create', targets: [{ current: { id: 'n1', slug: 'draft', category: null, is_published: false } }] },
      shouldRefresh: false,
    });
    expect(adminClientMock).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
    expect(result.targets).toEqual(['news']);
  });

  it('preserves an explicit dependency skip reason', async () => {
    const result = await refreshAiIndex({
      content: { entity: 'news', action: 'publish', targets: [] },
      shouldRefresh: false,
      skipReason: 'AIO tạm hoãn vì Search Visibility chưa đồng bộ thành công.',
    });
    expect(result).toMatchObject({
      status: 'skipped',
      error: 'AIO tạm hoãn vì Search Visibility chưa đồng bộ thành công.',
    });
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('returns degraded evidence when the server RPC fails', async () => {
    vi.stubEnv('AIO_RAG_MODE', 'enabled');
    adminClientMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('rag unavailable') }) });
    const result = await refreshAiIndex({
      content: { entity: 'property', action: 'publish', targets: [] },
      shouldRefresh: true,
    });
    expect(result).toMatchObject({ status: 'degraded', target: 'properties', targets: ['properties'], error: 'properties: rag unavailable' });
  });
});
