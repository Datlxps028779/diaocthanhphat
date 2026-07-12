// Bóc message thật từ mọi kiểu lỗi. Cần vì lỗi Supabase (PostgrestError) là object
// THƯỜNG {message, code, details, hint} — không phải instanceof Error — nên
// `err instanceof Error ? err.message : 'fallback'` luôn nuốt mất lỗi thật.
export function extractErrorMessage(err: unknown, fallback = 'Có lỗi xảy ra'): string {
  if (typeof err === 'string') return err.trim() || fallback;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    const message = typeof e.message === 'string' ? e.message.trim() : '';
    const details = typeof e.details === 'string' ? e.details.trim() : '';
    const hint = typeof e.hint === 'string' ? e.hint.trim() : '';
    const parts = [message || details, message && details ? details : '', hint]
      .filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }
  return fallback;
}
