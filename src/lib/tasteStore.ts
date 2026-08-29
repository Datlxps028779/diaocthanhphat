// Lưu tín hiệu hành vi vào localStorage (không cần đăng nhập, không cần DB) — tầng
// I/O cho engine taste.ts. Chỉ giữ thuộc tính suy sở thích, không PII. Giới hạn số
// tín hiệu để không phình localStorage.
import { normalizeSignalAttrs, signalDedupeKey, type Signal, type SignalAttrs, type SignalKind } from './taste';

const KEY = 'dtp_taste_signals';
const MAX = 60;
export const TASTE_SIGNALS_CHANGED_EVENT = 'dtp-taste-signals-changed';
export const TASTE_SIGNALS_STORAGE_KEY = KEY;

function notifyChanged(): void {
  try {
    window.dispatchEvent(new Event(TASTE_SIGNALS_CHANGED_EVENT));
  } catch {
    // Không có Event API trong SSR/test tối giản.
  }
}

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
export interface RecordSignalOptions {
  dedupeWindowMs?: number;
  now?: number;
  eventId?: string;
}

function createLocalEventId(now: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${now}-${Math.random().toString(36).slice(2)}`;
}

export function recordSignal(kind: SignalKind, attrs: SignalAttrs, opts: RecordSignalOptions = {}): string | null {
  if (typeof window === 'undefined') return null;
  const normalized = normalizeSignalAttrs(attrs);
  const hasContent = normalized.areaId || normalized.typeId || normalized.listingType || normalized.price;
  if (!hasContent) return null;

  const now = opts.now ?? Date.now();
  const eventId = opts.eventId ?? createLocalEventId(now);
  const existing = read();
  if (opts.dedupeWindowMs && opts.dedupeWindowMs > 0) {
    const key = signalDedupeKey(kind, normalized);
    const duplicateIndex = existing.findIndex(signal =>
      signalDedupeKey(signal.kind, signal) === key &&
      now - signal.ts >= 0 &&
      now - signal.ts < opts.dedupeWindowMs!,
    );
    if (duplicateIndex >= 0) {
      const duplicateEventId = existing[duplicateIndex].eventId || eventId;
      if (!existing[duplicateIndex].eventId) {
        existing[duplicateIndex] = { ...existing[duplicateIndex], eventId: duplicateEventId };
        try {
          window.localStorage.setItem(KEY, JSON.stringify(existing));
          notifyChanged();
        } catch {
          // Remote vẫn có thể retry bằng event id vừa gắn.
        }
      }
      return duplicateEventId;
    }
  }

  const entry: Signal = {
    kind,
    eventId,
    ...normalized,
    ts: now,
  };
  const next = [entry, ...existing].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    notifyChanged();
  } catch {
    // Signal vẫn hợp lệ; cho phép tầng remote ghi khi localStorage bị chặn/đầy.
  }
  return eventId;
}

export function reconcileSignalEventId(currentEventId: string, canonicalEventId: string): void {
  if (typeof window === 'undefined' || !currentEventId || !canonicalEventId || currentEventId === canonicalEventId) return;
  const existing = read();
  let changed = false;
  const next = existing.map(signal => {
    if (signal.eventId !== currentEventId) return signal;
    changed = true;
    return { ...signal, eventId: canonicalEventId };
  });
  if (!changed) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    notifyChanged();
  } catch {
    // Remote vẫn giữ canonical event; local sẽ hội tụ ở lần ghi/đọc sau.
  }
}
