import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser },
    rpc,
  },
}));

import { pushTasteSignal } from './taste';

describe('pushTasteSignal', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    rpc.mockResolvedValue({ data: '11111111-1111-4111-8111-111111111111', error: null });
  });

  it('gọi RPC sliding-window với dedupe key cho search', async () => {
    const canonicalEventId = await pushTasteSignal(
      'search',
      { areaId: 'a1', typeId: 't1', listingType: 'mua_ban', price: null },
      { dedupeWindowMs: 30 * 60 * 1000, eventId: '11111111-1111-4111-8111-111111111111' },
    );

    expect(canonicalEventId).toBe('11111111-1111-4111-8111-111111111111');
    expect(rpc).toHaveBeenCalledWith('record_user_taste_signal', {
      p_kind: 'search',
      p_event_id: '11111111-1111-4111-8111-111111111111',
      p_area_id: 'a1',
      p_type_id: 't1',
      p_listing_type: 'mua_ban',
      p_price: null,
      p_dedupe_key: '["search","a1","t1","mua_ban",null]',
      p_dedupe_window_seconds: 1800,
    });
  });

  it('không gọi remote khi chưa đăng nhập', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await pushTasteSignal('view', { areaId: 'a1' });
    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('để caller xử lý lỗi RPC thay vì báo thành công giả', async () => {
    rpc.mockResolvedValue({ error: new Error('database unavailable') });
    await expect(pushTasteSignal('view', { areaId: 'a1' })).rejects.toThrow('database unavailable');
  });
});
