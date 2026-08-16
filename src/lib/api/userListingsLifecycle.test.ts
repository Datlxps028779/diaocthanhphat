import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: mocks.from,
    auth: { getSession: vi.fn() },
  },
}));

import { adminGetUserListingLifecycle } from './userListings';

describe('adminGetUserListingLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
  });

  it('queries only the selected listing and orders its events newest first', async () => {
    const rows = [{ id: 'event-1', occurred_at: '2026-08-16T12:00:00.000Z' }];
    mocks.order.mockResolvedValue({ data: rows, error: null });

    await expect(adminGetUserListingLifecycle('listing-1')).resolves.toEqual(rows);
    expect(mocks.from).toHaveBeenCalledWith('user_listing_lifecycle_events');
    expect(mocks.select).toHaveBeenCalledWith('*');
    expect(mocks.eq).toHaveBeenCalledWith('listing_id', 'listing-1');
    expect(mocks.order).toHaveBeenCalledWith('occurred_at', { ascending: false });
  });

  it('propagates database and RLS errors instead of showing a false empty history', async () => {
    const error = new Error('permission denied');
    mocks.order.mockResolvedValue({ data: null, error });

    await expect(adminGetUserListingLifecycle('listing-1')).rejects.toBe(error);
  });
});
