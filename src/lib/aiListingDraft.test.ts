import { describe, expect, it } from 'vitest';
import {
  createAiListingProvenance,
  fingerprintAiOutput,
  isAiListingProvenance,
  isAiListingSeoDraft,
  parseAiListingProvenance,
  replaceAiListingProvenance,
} from './aiListingDraft';

describe('aiListingDraft', () => {
  const draft = createAiListingProvenance({
    kind: 'description',
    provider: 'deterministic-fallback',
    inputFields: ['title', 'title', 'contact_phone', 'area'],
    output: 'Nhà phố tại Bình Dương.',
    generatedAt: '2026-08-31T10:00:00.000Z',
  });

  it('creates a bounded provenance record without PII field names', () => {
    expect(draft.input_fields).toEqual(['title', 'area']);
    expect(draft.status).toBe('draft');
    expect(draft.contract_version).toBe('p10-v1');
    expect(draft.output_fingerprint).toBe(fingerprintAiOutput('Nhà phố tại Bình Dương.'));
  });

  it('fails closed for malformed records', () => {
    expect(isAiListingProvenance({ ...draft, kind: 'unknown' })).toBe(false);
    expect(isAiListingProvenance({ ...draft, output_fingerprint: 'unsafe' })).toBe(false);
    expect(isAiListingProvenance({ ...draft, input_fields: ['contact_phone'] })).toBe(false);
    expect(parseAiListingProvenance([draft, { broken: true }])).toEqual([draft]);
  });

  it('accepts a valid SEO draft and rejects a non-SEO provenance', () => {
    const seo = {
      tags: ['nha-pho-binh-duong'],
      meta_title: 'Nhà phố Bình Dương',
      meta_description: 'Bản nháp SEO cần được duyệt.',
      provenance: createAiListingProvenance({ kind: 'seo', provider: 'anthropic', inputFields: ['title'], output: 'nha-pho-binh-duong' }),
    };
    expect(isAiListingSeoDraft(seo)).toBe(true);
    expect(isAiListingSeoDraft({ ...seo, provenance: draft })).toBe(false);
  });

  it('replaces only the same AI draft kind', () => {
    const seo = createAiListingProvenance({ kind: 'seo', provider: 'anthropic', model: 'claude-haiku-4-5', inputFields: ['title'], output: 'nha-pho-binh-duong' });
    const nextDescription = { ...draft, status: 'accepted' as const };
    expect(replaceAiListingProvenance([draft, seo], nextDescription)).toEqual([seo, nextDescription]);
  });
});
