// Lưu tín hiệu hành vi vào localStorage (không cần đăng nhập, không cần DB) — tầng
// I/O cho engine taste.ts. Chỉ giữ thuộc tính suy sở thích, không PII. Giới hạn số
// tín hiệu để không phình localStorage.
import type { Signal, SignalKind } from './taste';

const KEY = 'dtp_taste_signals';
const MAX = 60;

function read(): Signal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Signal[]) : [];
  } catch {
    return [];
  }
}

export function getSignals(): Signal[] {
  return read();
}

// Ghi 1 tín hiệu mới lên đầu, cắt còn MAX. Bỏ qua tín hiệu "rỗng" (không mang thuộc
// tính nào để suy sở thích) — tránh làm loãng hồ sơ.
export function recordSignal(kind: SignalKind, attrs: {
  areaId?: string | null; typeId?: string | null; listingType?: string | null; price?: number | null;
}): void {
  if (typeof window === 'undefined') return;
  const hasContent = attrs.areaId || attrs.typeId || attrs.listingType || (typeof attrs.price === 'number' && attrs.price > 0);
  if (!hasContent) return;
  const entry: Signal = {
    kind,
    areaId: attrs.areaId ?? null,
    typeId: attrs.typeId ?? null,
    listingType: attrs.listingType ?? null,
    price: attrs.price ?? null,
    ts: Date.now(),
  };
  const next = [entry, ...read()].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage đầy/bị chặn (private mode) → bỏ qua, không phải lỗi nghiêm trọng.
  }
}
