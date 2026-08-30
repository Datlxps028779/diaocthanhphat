export interface ListingDraft<T> {
  version: 1;
  savedAt: number;
  step: number;
  form: T;
}

const PREFIX = 'chonhaviet:listing-draft:v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function listingDraftKey(userId: string, editId?: string): string {
  return `${PREFIX}:${userId}:${editId || 'new'}`;
}

export function readListingDraft<T>(userId: string, editId?: string, now = Date.now()): ListingDraft<T> | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(listingDraftKey(userId, editId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ListingDraft<T>>;
    if (parsed.version !== 1 || typeof parsed.savedAt !== 'number' || !parsed.form || now - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(listingDraftKey(userId, editId));
      return null;
    }
    return parsed as ListingDraft<T>;
  } catch {
    return null;
  }
}

export function writeListingDraft<T>(userId: string, editId: string | undefined, form: T, step: number, now = Date.now()): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    window.localStorage.setItem(listingDraftKey(userId, editId), JSON.stringify({ version: 1, savedAt: now, step, form }));
    return true;
  } catch {
    return false;
  }
}

export function clearListingDraft(userId: string, editId?: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try { window.localStorage.removeItem(listingDraftKey(userId, editId)); } catch { /* storage may be blocked */ }
}

export function hasListingDraftContent<T extends object>(form: T): boolean {
  return Object.entries(form as Record<string, unknown>).some(([key, value]) => key !== 'meta_title' && key !== 'meta_description' && key !== 'focus_keywords' && key !== 'schema_markup' && (
    typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) ? value.length > 0 : Boolean(value)
  ));
}
