import { describe, expect, it } from 'vitest';
import {
  formatPublicVerificationDate,
  PUBLIC_VERIFICATION_REASON_LABELS,
  normalizePublicVerificationSummary,
  publicVerificationLabel,
  publicVerificationReasonShortLabels,
} from './propertyVerification';

describe('public verification summary', () => {
  it('fails closed for legacy boolean-only and expired rows', () => {
    expect(normalizePublicVerificationSummary({ is_verified: true })).toBeNull();
    expect(normalizePublicVerificationSummary({
      is_verified: true,
      verification_status: 'verified',
      verification_scope_codes: ['contact_confirmed'],
      verified_at: '2026-08-01T00:00:00.000Z',
      verified_until: '2026-08-16T00:00:00.000Z',
    }, new Date('2026-08-17T00:00:00.000Z'))).toBeNull();
  });

  it('keeps only safe known reason codes in deterministic policy order', () => {
    expect(normalizePublicVerificationSummary({
      is_verified: true,
      verification_status: 'verified',
      verification_scope_codes: ['media_reviewed', 'unknown', 'contact_confirmed', 'contact_confirmed'],
      verified_at: '2026-08-01T00:00:00.000Z',
      verified_until: '2026-09-01T00:00:00.000Z',
    }, new Date('2026-08-17T00:00:00.000Z'))).toEqual({
      verifiedAt: '2026-08-01T00:00:00.000Z',
      verifiedUntil: '2026-09-01T00:00:00.000Z',
      reasonCodes: ['contact_confirmed', 'media_reviewed'],
    });
  });

  it('uses scope-limited public wording without legal guarantees', () => {
    expect(PUBLIC_VERIFICATION_REASON_LABELS.contact_confirmed).toContain('liên hệ');
    expect(publicVerificationLabel(['contact_confirmed', 'media_reviewed']))
      .toBe('Hồ sơ đã được kiểm tra');
  });

  it('exposes concise scope labels and stable Vietnamese dates for detail UI', () => {
    expect(publicVerificationReasonShortLabels(['media_reviewed', 'contact_confirmed']))
      .toEqual(['Liên hệ', 'Ảnh/video']);
    expect(formatPublicVerificationDate('2026-08-01T00:00:00.000Z')).toBe('01/08/2026');
  });
});
