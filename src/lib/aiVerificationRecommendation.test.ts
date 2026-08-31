import { describe, expect, it } from 'vitest';
import {
  buildAiVerificationRecommendation,
  fingerprintAiVerification,
  isAiVerificationRecommendation,
  parseAiVerificationRecommendation,
} from './aiVerificationRecommendation';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';

function baseInput() {
  return {
    caseId: CASE_ID,
    caseStatus: 'draft' as const,
    scopeCodes: ['contact_confirmed', 'document_reference_reviewed', 'contact_confirmed'],
    evidence: [{ id: EVIDENCE_ID, kind: 'document_reference' as const }],
    generatedAt: '2026-08-31T10:00:00.000Z',
  };
}

describe('aiVerificationRecommendation', () => {
  it('fails closed when a case has no evidence', () => {
    const recommendation = buildAiVerificationRecommendation({ ...baseInput(), evidence: [] });
    expect(recommendation.status).toBe('insufficient_evidence');
    expect(recommendation.evidence).toEqual([]);
    expect(recommendation.missing_scopes).toEqual(['contact_confirmed', 'document_reference_reviewed']);
    expect(recommendation.warnings[0]).toContain('không phải kết luận xác minh');
  });

  it('binds only valid evidence references to the requested case output', () => {
    const recommendation = buildAiVerificationRecommendation({
      ...baseInput(),
      evidence: [
        { id: EVIDENCE_ID, kind: 'document_reference' },
        { id: 'not-an-id', kind: 'document_reference' },
        { id: EVIDENCE_ID, kind: 'document_reference' },
        { id: '33333333-3333-4333-8333-333333333333', kind: 'other' },
      ],
    });
    expect(recommendation.evidence).toEqual([
      { id: EVIDENCE_ID, kind: 'document_reference' },
      { id: '33333333-3333-4333-8333-333333333333', kind: 'other' },
    ]);
    expect(recommendation.case_id).toBe(CASE_ID);
  });

  it('keeps the recommendation non-binding and deterministic', () => {
    const first = buildAiVerificationRecommendation(baseInput());
    const second = buildAiVerificationRecommendation(baseInput());
    expect(first).toEqual(second);
    expect(first.provenance.output_fingerprint).toBe(fingerprintAiVerification(JSON.stringify({
      case_id: CASE_ID,
      case_status: 'draft',
      scope_codes: ['contact_confirmed', 'document_reference_reviewed'],
      evidence: [{ id: EVIDENCE_ID, kind: 'document_reference' }],
      status: 'needs_more_evidence',
      missing_scopes: ['contact_confirmed'],
    })));
    expect(JSON.stringify(first)).not.toContain('properties');
    expect(JSON.stringify(first)).not.toContain('verified: true');
  });

  it('rejects malformed or unsafe recommendation records', () => {
    const recommendation = buildAiVerificationRecommendation(baseInput());
    expect(isAiVerificationRecommendation(recommendation)).toBe(true);
    expect(parseAiVerificationRecommendation({ ...recommendation, status: 'verified' })).toBeNull();
    expect(parseAiVerificationRecommendation({ ...recommendation, evidence: [{ id: CASE_ID, kind: 'unsafe' }] })).toBeNull();
    expect(parseAiVerificationRecommendation({ ...recommendation, provenance: { ...recommendation.provenance, provider: 'anthropic' } })).toBeNull();
  });
});
