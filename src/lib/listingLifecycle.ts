import type { UserListing, UserListingLifecycleEvent } from './supabase';

const STATUS_LABELS: Record<UserListing['status'], string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  expired: 'Hết hạn',
};

const EVENT_LABELS: Record<UserListingLifecycleEvent['event_type'], string> = {
  submitted: 'Gửi tin mới',
  approved: 'Duyệt tin',
  rejected: 'Từ chối tin',
  resubmitted: 'Gửi duyệt lại',
  renewed: 'Yêu cầu gia hạn',
  expired: 'Tin hết hạn',
  expiry_changed: 'Đổi thời hạn',
  deleted: 'Xóa tin',
  admin_edited: 'Chỉnh sửa trước duyệt',
};

const ACTOR_LABELS: Record<UserListingLifecycleEvent['actor_role'], string> = {
  owner: 'Người đăng',
  staff: 'Nhân viên',
  admin: 'Quản trị viên',
  system: 'Hệ thống',
};

export function listingLifecycleEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType as UserListingLifecycleEvent['event_type']] ?? 'Cập nhật vòng đời';
}

export function listingLifecycleActorLabel(actorRole: string): string {
  return ACTOR_LABELS[actorRole as UserListingLifecycleEvent['actor_role']] ?? 'Không xác định';
}

export function listingStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return STATUS_LABELS[status as UserListing['status']] ?? status;
}

export function listingLifecycleTransition(event: Pick<UserListingLifecycleEvent, 'from_status' | 'to_status'>): string | null {
  const from = listingStatusLabel(event.from_status);
  const to = listingStatusLabel(event.to_status);
  if (from && to && from !== to) return `${from} → ${to}`;
  return to ?? from;
}

function nullableDateString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function listingLifecycleExpiryMetadata(
  metadata: Record<string, unknown>,
): { oldExpiresAt: string | null; newExpiresAt: string | null } | null {
  if (!('old_expires_at' in metadata) && !('new_expires_at' in metadata)) return null;
  const oldExpiresAt = metadata.old_expires_at ?? null;
  const newExpiresAt = metadata.new_expires_at ?? null;
  if (!nullableDateString(oldExpiresAt) || !nullableDateString(newExpiresAt)) return null;
  return { oldExpiresAt, newExpiresAt };
}
