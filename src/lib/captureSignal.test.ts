import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordSignal, reconcileSignalEventId, pushTasteSignal } = vi.hoisted(() => ({
  recordSignal: vi.fn(),
  reconcileSignalEventId: vi.fn(),
  pushTasteSignal: vi.fn(() => Promise.resolve<string | null>(null)),
}));

vi.mock('./tasteStore', () => ({ recordSignal, reconcileSignalEventId }));
vi.mock('./api/taste', () => ({ pushTasteSignal }));

import { captureSignal, captureSignalFromProperty } from './captureSignal';
import type { Property } from './supabase';

describe('captureSignal', () => {
  beforeEach(() => {
    recordSignal.mockReset();
    reconcileSignalEventId.mockReset();
    pushTasteSignal.mockReset();
    pushTasteSignal.mockResolvedValue(null);
  });

  it('vẫn thử đồng bộ remote và hội tụ canonical id khi local dedupe signal', async () => {
    recordSignal.mockReturnValue('existing-event-id');
    pushTasteSignal.mockResolvedValue('remote-canonical-id');
    const attrs = { areaId: 'a1', typeId: 't1', listingType: 'mua_ban' };
    const opts = { dedupeWindowMs: 30 * 60 * 1000 };

    captureSignal('search', attrs, opts);

    expect(recordSignal).toHaveBeenCalledWith('search', attrs, expect.objectContaining({
      dedupeWindowMs: 30 * 60 * 1000,
      eventId: expect.any(String),
    }));
    expect(pushTasteSignal).toHaveBeenCalledWith('search', attrs, {
      dedupeWindowMs: 30 * 60 * 1000,
      eventId: 'existing-event-id',
    });
    await Promise.resolve();
    expect(reconcileSignalEventId).toHaveBeenCalledWith('existing-event-id', 'remote-canonical-id');
  });

  it('rút thuộc tính không PII từ sản phẩm cho behavior signal', () => {
    recordSignal.mockReturnValue('event-id');
    const property = {
      area_id: 'a1',
      property_type_id: 't1',
      listing_type: 'cho_thue',
      price: 8,
    } as Property;

    captureSignalFromProperty('view', property);

    expect(pushTasteSignal).toHaveBeenCalledWith('view', {
      areaId: 'a1',
      typeId: 't1',
      listingType: 'cho_thue',
      price: null,
    }, { eventId: 'event-id' });
  });
});
