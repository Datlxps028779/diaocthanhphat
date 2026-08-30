import { describe, expect, it } from 'vitest';
import { hasListingDraftContent, listingDraftKey } from './listingDraft';

describe('listingDraft', () => {
  it('names drafts by user and edit scope', () => {
    expect(listingDraftKey('user-1')).toContain(':user-1:new');
    expect(listingDraftKey('user-1', 'listing-2')).toContain(':user-1:listing-2');
  });

  it('ignores generated SEO fields when checking for content', () => {
    expect(hasListingDraftContent({ meta_title: 'auto', meta_description: 'auto', focus_keywords: 'auto', schema_markup: 'auto' })).toBe(false);
    expect(hasListingDraftContent({ title: 'Nhà phố' })).toBe(true);
  });
});
