import { describe, expect, it, vi } from 'vitest';
import { hasListingDraftContent, listingDraftKey, readListingDraft, writeListingDraft } from './listingDraft';

describe('listingDraft', () => {
  it('names drafts by user and edit scope', () => {
    expect(listingDraftKey('user-1')).toContain(':user-1:new');
    expect(listingDraftKey('user-1', 'listing-2')).toContain(':user-1:listing-2');
  });

  it('không lưu hoặc khôi phục contact từ draft local', () => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    vi.stubGlobal('window', { localStorage });

    writeListingDraft('user-1', undefined, {
      title: 'Nhà phố', contact_name: 'Giả mạo', contact_phone: '0900000000', contact_zalo: 'zalo-gia-mao',
    }, 3, 1000);
    const raw = JSON.parse(store.get(listingDraftKey('user-1'))!);
    expect(raw.form).not.toHaveProperty('contact_name');
    expect(raw.form).not.toHaveProperty('contact_phone');
    expect(raw.form).not.toHaveProperty('contact_zalo');

    store.set(listingDraftKey('user-1'), JSON.stringify({
      version: 1, savedAt: 1000, step: 3,
      form: { title: 'Nhà phố', contact_name: 'Giả mạo', contact_phone: '0900000000' },
    }));
    expect(readListingDraft('user-1', undefined, 1000)?.form).not.toHaveProperty('contact_name');
  });

  it('ignores generated SEO fields when checking for content', () => {
    expect(hasListingDraftContent({ meta_title: 'auto', meta_description: 'auto', focus_keywords: 'auto', schema_markup: 'auto' })).toBe(false);
    expect(hasListingDraftContent({ title: 'Nhà phố' })).toBe(true);
  });
});