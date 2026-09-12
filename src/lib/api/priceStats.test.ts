import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));
const revalidateMock = vi.hoisted(() => vi.fn());

vi.mock('../supabase', () => ({ supabase: supabaseMock }));
vi.mock('./contentRevalidation', () => ({
  revalidateRouteContent: revalidateMock,
  routeRevalidationSnapshot: vi.fn((path: string) => ({ path })),
}));

import { adminRefreshPriceStats } from './priceStats';

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.rpc.mockResolvedValue({ data: 12, error: null });
  supabaseMock.from.mockImplementation((table: string) => ({
    select: vi.fn(() => Promise.resolve({
      data: table === 'areas' ? [{ slug: 'binh-duong' }] : [{ slug: 'tan-binh' }],
      error: null,
    })),
  }));
  revalidateMock.mockResolvedValue([]);
});

describe('adminRefreshPriceStats', () => {
  it('refreshes price data and purges every public price surface', async () => {
    await expect(adminRefreshPriceStats()).resolves.toBe(12);

    expect(revalidateMock).toHaveBeenCalledWith('update', expect.arrayContaining([
      { current: { path: '/du-lieu-gia' } },
      { current: { path: '/khu-vuc/binh-duong' } },
      { current: { path: '/mua-ban/binh-duong' } },
      { current: { path: '/cho-thue/binh-duong' } },
      { current: { path: '/khu-dan-cu/tan-binh' } },
    ]));
  });

  it('does not purge unsafe taxonomy slugs', async () => {
    supabaseMock.from.mockImplementation((table: string) => ({
      select: vi.fn(() => Promise.resolve({
        data: table === 'areas' ? [{ slug: 'binh-duong?bad' }] : [{ slug: 'khu/xau' }],
        error: null,
      })),
    }));

    await adminRefreshPriceStats();
    const targets = revalidateMock.mock.calls[0][1] as Array<{ current: { path: string } }>;
    expect(targets.map(target => target.current.path)).not.toContain('/khu-vuc/binh-duong?bad');
    expect(targets.map(target => target.current.path)).not.toContain('/khu-dan-cu/khu/xau');
  });
});
