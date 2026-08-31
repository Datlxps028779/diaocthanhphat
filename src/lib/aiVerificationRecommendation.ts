import type {
  PropertyVerificationEvidence,
  PropertyVerificationEvidenceKind,
  PropertyVerificationStatus,
} from './supabase';
import { PUBLIC_VERIFICATION_REASON_ORDER, type PublicVerificationReasonCode } from './propertyVerification';

export type AiVerificationRecommendationStatus =
  | 'insufficient_evidence'
  | 'needs_more_evidence'
  | 'ready_for_manual_review';

export interface AiVerificationEvidenceReference {
  id: string;
  kind: PropertyVerificationEvidenceKind;
}

export interface AiVerificationProvenance {
  provider: 'deterministic-fallback';
  model: null;
  generated_at: string;
  input_fields: string[];
  contract_version: 'p11-v1';
  output_fingerprint: string;
}

export interface AiVerificationRecommendation {
  case_id: string;
  case_status: PropertyVerificationStatus;
  status: AiVerificationRecommendationStatus;
  summary: string;
  missing_scopes: PublicVerificationReasonCode[];
  evidence: AiVerificationEvidenceReference[];
  warnings: string[];
  provenance: AiVerificationProvenance;
}

const VERIFICATION_STATUSES = new Set<PropertyVerificationStatus>(['draft', 'submitted', 'verified', 'rejected', 'revoked', 'withdrawn', 'superseded']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT_FIELDS = ['case_status', 'scope_codes', 'evidence_ids', 'evidence_kinds'];
const WARNING = 'Đây chỉ là gợi ý hỗ trợ; không phải kết luận xác minh, bảo đảm pháp lý hoặc cam kết an toàn giao dịch.';
const EVIDENCE_BY_SCOPE: Record<PublicVerificationReasonCode, PropertyVerificationEvidenceKind> = {
  contact_confirmed: 'contact_confirmation',
  location_info_reviewed: 'location_reference',
  media_reviewed: 'media_reference',
  listing_details_reviewed: 'other',
  document_reference_reviewed: 'document_reference',
};

export function fingerprintAiVerification(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeScopes(values: readonly string[]): PublicVerificationReasonCode[] {
  const found = new Set(values);
  return PUBLIC_VERIFICATION_REASON_ORDER.filter(code => found.has(code));
}

function normalizeEvidence(values: readonly Pick<PropertyVerificationEvidence, 'id' | 'kind'>[]): AiVerificationEvidenceReference[] {
  const seen = new Set<string>();
  return values
    .filter(item => {
      if (!UUID_PATTERN.test(item.id) || seen.has(item.id) || !Object.values(EVIDENCE_BY_SCOPE).includes(item.kind)) return false;
      seen.add(item.id);
      return true;
    })
    .map(item => ({ id: item.id, kind: item.kind }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildAiVerificationRecommendation(input: {
  caseId: string;
  caseStatus: PropertyVerificationStatus;
  scopeCodes: readonly string[];
  evidence: readonly Pick<PropertyVerificationEvidence, 'id' | 'kind'>[];
  generatedAt?: string;
}): AiVerificationRecommendation {
  const scopes = normalizeScopes(input.scopeCodes);
  const evidence = normalizeEvidence(input.evidence);
  const coveredKinds = new Set(evidence.map(item => item.kind));
  const missingScopes = scopes.filter(scope => !coveredKinds.has(EVIDENCE_BY_SCOPE[scope]));
  const status: AiVerificationRecommendationStatus = evidence.length === 0
    ? 'insufficient_evidence'
    : missingScopes.length > 0
      ? 'needs_more_evidence'
      : 'ready_for_manual_review';
  const summary = status === 'insufficient_evidence'
    ? 'Chưa có bằng chứng riêng tư; chưa đủ cơ sở để chuyển hồ sơ sang bước xem xét thủ công.'
    : status === 'needs_more_evidence'
      ? `Cần bổ sung bằng chứng cho ${missingScopes.length} phạm vi trước khi owner MFA xem xét thủ công.`
      : 'Đã có tham chiếu bằng chứng theo phạm vi; owner MFA vẫn phải tự kiểm tra và quyết định thủ công.';
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const fingerprintInput = JSON.stringify({
    case_id: input.caseId,
    case_status: input.caseStatus,
    scope_codes: scopes,
    evidence,
    status,
    missing_scopes: missingScopes,
  });

  return {
    case_id: input.caseId,
    case_status: input.caseStatus,
    status,
    summary,
    missing_scopes: missingScopes,
    evidence,
    warnings: [WARNING],
    provenance: {
      provider: 'deterministic-fallback',
      model: null,
      generated_at: generatedAt,
      input_fields: [...INPUT_FIELDS],
      contract_version: 'p11-v1',
      output_fingerprint: fingerprintAiVerification(fingerprintInput),
    },
  };
}

export function isAiVerificationRecommendation(value: unknown): value is AiVerificationRecommendation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const provenance = row.provenance;
  if (!provenance || typeof provenance !== 'object') return false;
  const source = provenance as Record<string, unknown>;
  const evidence = row.evidence;
  const missingScopes = row.missing_scopes;
  return typeof row.case_id === 'string' && UUID_PATTERN.test(row.case_id)
    && typeof row.case_status === 'string' && VERIFICATION_STATUSES.has(row.case_status as PropertyVerificationStatus)
    && (row.status === 'insufficient_evidence' || row.status === 'needs_more_evidence' || row.status === 'ready_for_manual_review')
    && typeof row.summary === 'string' && row.summary.length > 0
    && Array.isArray(missingScopes) && missingScopes.every(code => typeof code === 'string' && PUBLIC_VERIFICATION_REASON_ORDER.includes(code as PublicVerificationReasonCode))
    && Array.isArray(evidence) && evidence.every(item => {
      if (!item || typeof item !== 'object') return false;
      const reference = item as Record<string, unknown>;
      return typeof reference.id === 'string' && UUID_PATTERN.test(reference.id)
        && typeof reference.kind === 'string' && Object.values(EVIDENCE_BY_SCOPE).includes(reference.kind as PropertyVerificationEvidenceKind);
    })
    && Array.isArray(row.warnings) && row.warnings.length > 0 && row.warnings.every(warning => typeof warning === 'string' && warning.length > 0)
    && source.provider === 'deterministic-fallback'
    && source.model === null
    && typeof source.generated_at === 'string' && !Number.isNaN(Date.parse(source.generated_at))
    && Array.isArray(source.input_fields) && source.input_fields.join('|') === INPUT_FIELDS.join('|')
    && source.contract_version === 'p11-v1'
    && typeof source.output_fingerprint === 'string' && /^[0-9a-f]{8}$/.test(source.output_fingerprint);
}

export function parseAiVerificationRecommendation(value: unknown): AiVerificationRecommendation | null {
  return isAiVerificationRecommendation(value) ? value : null;
}
