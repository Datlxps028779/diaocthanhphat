import { describe, expect, it } from 'vitest';
import { getSearchConsoleUiState } from './searchConsoleUiState';

describe('Search Console UI state', () => {
  it('keeps missing and invalid server configuration distinct', () => {
    expect(getSearchConsoleUiState('not_configured', null)).toBe('not_configured');
    expect(getSearchConsoleUiState('invalid', null)).toBe('invalid');
  });

  it('does not treat configured credentials as verified property access', () => {
    expect(getSearchConsoleUiState('configured', null)).toBe('configured_not_verified');
    expect(getSearchConsoleUiState('configured', { status: 'CANONICAL_PROPERTY_MISSING' })).toBe('configured_not_verified');
    expect(getSearchConsoleUiState('configured', { status: 'CANONICAL_PERMISSION_INSUFFICIENT' })).toBe('configured_not_verified');
  });

  it('marks the integration ready only after exact property access is confirmed', () => {
    expect(getSearchConsoleUiState('configured', { status: 'ACCESS_CONFIRMED' })).toBe('ready');
  });
});
