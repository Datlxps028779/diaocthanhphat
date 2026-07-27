// Ghi 1 tín hiệu hành vi: dual-write localStorage (khách vãng lai) + remote (tài khoản).
// Gộp recordSignal + pushTasteSignal về 1 chỗ để mọi điểm bắt (xem/tìm/thích/liên hệ)
// dùng chung, tránh lặp và quên nuốt lỗi remote. Chỉ mang thuộc tính suy sở thích — KHÔNG PII.
import type { Property } from './supabase';
import type { SignalKind } from './taste';
import { recordSignal } from './tasteStore';
import { pushTasteSignal } from './api/taste';

export function captureSignal(kind: SignalKind, attrs: {
  areaId?: string | null; typeId?: string | null; listingType?: string | null; price?: number | null;
}): void {
  recordSignal(kind, attrs);
  pushTasteSignal(kind, attrs).catch(() => {});
}

// Bắt tín hiệu từ 1 BĐS cụ thể (đã xem/thích/liên hệ) — rút đúng thuộc tính suy sở thích.
export function captureSignalFromProperty(kind: SignalKind, p: Property): void {
  captureSignal(kind, {
    areaId: p.area_id, typeId: p.property_type_id, listingType: p.listing_type, price: p.price,
  });
}
