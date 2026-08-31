export type AiListingDraftKind = 'description' | 'seo';
export type AiListingDraftStatus = 'draft' | 'accepted' | 'edited' | 'rejected';

export interface AiListingProvenance {
  kind: AiListingDraftKind;
  status: AiListingDraftStatus;
  provider: string;
  model: string | null;
  generated_at: string;
  input_fields: string[];
  contract_version: string;
  output_fingerprint: string;
}

const INPUT_FIELD_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/;
const PRIVATE_INPUT_FIELDS = new Set(['contact_name', 'contact_phone', 'contact_zalo']);

export function fingerprintAiOutput(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createAiListingProvenance(input: {
  kind: AiListingDraftKind;
  provider: string;
  model?: string | null;
  generatedAt?: string;
  inputFields: string[];
  output: string;
  status?: AiListingDraftStatus;
}): AiListingProvenance {
  return {
    kind: input.kind,
    status: input.status ?? 'draft',
    provider: input.provider.trim() || 'unknown',
    model: input.model?.trim() || null,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    input_fields: [...new Set(input.inputFields.filter(field => INPUT_FIELD_PATTERN.test(field) && !PRIVATE_INPUT_FIELDS.has(field)))],
    contract_version: 'p10-v1',
    output_fingerprint: fingerprintAiOutput(input.output),
  };
}

export function isAiListingProvenance(value: unknown): value is AiListingProvenance {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (row.kind === 'description' || row.kind === 'seo')
    && (row.status === 'draft' || row.status === 'accepted' || row.status === 'edited' || row.status === 'rejected')
    && typeof row.provider === 'string' && row.provider.length > 0
    && (row.model === null || typeof row.model === 'string')
    && typeof row.generated_at === 'string' && !Number.isNaN(Date.parse(row.generated_at))
    && Array.isArray(row.input_fields) && row.input_fields.every(field => typeof field === 'string' && INPUT_FIELD_PATTERN.test(field) && !PRIVATE_INPUT_FIELDS.has(field))
    && row.contract_version === 'p10-v1'
    && typeof row.output_fingerprint === 'string' && FINGERPRINT_PATTERN.test(row.output_fingerprint);
}

export function parseAiListingProvenance(value: unknown): AiListingProvenance[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAiListingProvenance);
}

export function replaceAiListingProvenance(
  current: unknown,
  next: AiListingProvenance,
): AiListingProvenance[] {
  return [...parseAiListingProvenance(current).filter(item => item.kind !== next.kind), next];
}

export interface AiListingSeoDraft {
  tags: string[];
  meta_title: string | null;
  meta_description: string | null;
  provenance: AiListingProvenance;
}

export function isAiListingSeoDraft(value: unknown): value is AiListingSeoDraft {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.provenance !== null
    && isAiListingProvenance(row.provenance)
    && row.provenance.kind === 'seo'
    && Array.isArray(row.tags)
    && row.tags.every(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 64)
    && (row.meta_title === null || typeof row.meta_title === 'string')
    && (row.meta_description === null || typeof row.meta_description === 'string');
}

export function parseAiListingSeoDraft(value: unknown): AiListingSeoDraft | null {
  return isAiListingSeoDraft(value) ? value : null;
}
