import { describe, expect, it } from 'vitest';
import { assertVerificationEvidenceFile, VERIFICATION_EVIDENCE_BUCKET } from './propertyVerification';

describe('property verification evidence upload guards', () => {
  it('uses a dedicated private evidence bucket', () => {
    expect(VERIFICATION_EVIDENCE_BUCKET).toBe('verification-evidence');
  });

  it('accepts only bounded supported evidence files', () => {
    expect(() => assertVerificationEvidenceFile(new File(['x'], 'proof.pdf', { type: 'application/pdf' }))).not.toThrow();
    expect(() => assertVerificationEvidenceFile(new File(['x'], 'proof.exe', { type: 'application/octet-stream' }))).toThrow(/PDF, JPEG, PNG hoặc WebP/);
    expect(() => assertVerificationEvidenceFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toThrow(/lớn hơn 0/);
  });
});
