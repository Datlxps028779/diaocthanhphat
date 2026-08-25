import { describe, expect, it } from 'vitest';
import { savedSearchManagementHref, shouldShowSavedSearchNotice } from './savedSearchJourney';

describe('savedSearchJourney', () => {
  it('shows the confirmation once per saved-search and criteria signature', () => {
    const current = { savedSearchId: 'search-1', signature: '{"areaId":"area-1"}' };
    expect(shouldShowSavedSearchNotice(null, current)).toBe(true);
    expect(shouldShowSavedSearchNotice(current, current)).toBe(false);
    expect(shouldShowSavedSearchNotice(current, { ...current, signature: '{"areaId":"area-2"}' })).toBe(true);
  });

  it('uses the actual saved-search management tab, not a claim of delivered alerts', () => {
    expect(savedSearchManagementHref()).toBe('/tai-khoan?tab=saved');
  });
});
