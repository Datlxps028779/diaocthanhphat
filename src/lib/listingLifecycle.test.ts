import { describe, expect, it } from 'vitest';
import {
  listingLifecycleActorLabel,
  listingLifecycleEventLabel,
  listingLifecycleExpiryMetadata,
  listingLifecycleTransition,
  listingStatusLabel,
} from './listingLifecycle';

describe('listingLifecycle formatting', () => {
  it('maps lifecycle events, statuses and actors to internal Vietnamese labels', () => {
    expect(listingLifecycleEventLabel('approved')).toBe('Duyệt tin');
    expect(listingLifecycleEventLabel('expiry_changed')).toBe('Đổi thời hạn');
    expect(listingStatusLabel('pending')).toBe('Chờ duyệt');
    expect(listingLifecycleActorLabel('staff')).toBe('Nhân viên');
  });

  it('keeps a safe fallback for event data added by a newer database version', () => {
    expect(listingLifecycleEventLabel('future_event')).toBe('Cập nhật vòng đời');
    expect(listingLifecycleActorLabel('future_role')).toBe('Không xác định');
    expect(listingStatusLabel('future_status')).toBe('future_status');
  });

  it('describes status transitions without duplicating an unchanged status', () => {
    expect(listingLifecycleTransition({ from_status: 'pending', to_status: 'approved' })).toBe('Chờ duyệt → Đã duyệt');
    expect(listingLifecycleTransition({ from_status: 'approved', to_status: 'approved' })).toBe('Đã duyệt');
    expect(listingLifecycleTransition({ from_status: null, to_status: 'pending' })).toBe('Chờ duyệt');
    expect(listingLifecycleTransition({ from_status: null, to_status: null })).toBeNull();
  });

  it('reads only controlled expiry metadata values', () => {
    expect(listingLifecycleExpiryMetadata({
      old_expires_at: '2026-09-01T00:00:00.000Z',
      new_expires_at: null,
    })).toEqual({
      oldExpiresAt: '2026-09-01T00:00:00.000Z',
      newExpiresAt: null,
    });
    expect(listingLifecycleExpiryMetadata({ old_expires_at: 123 })).toBeNull();
    expect(listingLifecycleExpiryMetadata({ unrelated: 'value' })).toBeNull();
  });
});
