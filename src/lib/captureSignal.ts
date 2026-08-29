// Ghi 1 tín hiệu hành vi: dual-write localStorage (khách vãng lai) + remote (tài khoản).
// Gộp recordSignal + pushTasteSignal về 1 chỗ để mọi điểm bắt (xem/tìm/thích/liên hệ)
// dùng chung, tránh lặp và quên nuốt lỗi remote. Chỉ mang thuộc tính suy sở thích — KHÔNG PII.
import type { Property } from './supabase';
import { createSignalEventId, type SignalAttrs, type SignalKind } from './taste';
import { reconcileSignalEventId, recordSignal, type RecordSignalOptions } from './tasteStore';
import { pushTasteSignal } from './api/taste';

export function captureSignal(kind: SignalKind, attrs: SignalAttrs, opts: RecordSignalOptions = {}): void {
  const eventId = createSignalEventId();
  const localEventId = recordSignal(kind, attrs, { ...opts, eventId });
  const canonicalLocalEventId = localEventId ?? eventId;
  // Local dedupe không được chặn remote retry/sync sau đăng nhập; RPC trả canonical
  // event id để nhiều thiết bị hội tụ về cùng một signal.
  pushTasteSignal(kind, attrs, { ...opts, eventId: canonicalLocalEventId })
    .then(remoteEventId => {
      if (remoteEventId) reconcileSignalEventId(canonicalLocalEventId, remoteEventId);
    })
    .catch(() => {});
}

// Bắt tín hiệu từ 1 BĐS cụ thể (đã xem/thích/liên hệ) — rút đúng thuộc tính suy sở thích.
export function captureSignalFromProperty(kind: SignalKind, p: Property): void {
  captureSignal(kind, {
    areaId: p.area_id,
    typeId: p.property_type_id,
    listingType: p.listing_type,
    // Không ghi giá thô vì `price`, `price_unit` và `price_per_month` chưa cùng đơn vị.
    price: null,
  });
}
