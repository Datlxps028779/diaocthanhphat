import { supabase, type PropertyVerificationCase, type PropertyVerificationEvidence, type PropertyVerificationEvent } from '../supabase';

export const VERIFICATION_EVIDENCE_BUCKET = 'verification-evidence';
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export interface VerificationCaseInput {
  propertyId: string;
  userListingId?: string | null;
  scopeCodes: string[];
  publicReasonCodes: string[];
}

export function assertVerificationEvidenceFile(file: File): void {
  if (!ALLOWED_EVIDENCE_MIME.has(file.type)) {
    throw new Error('Chỉ nhận PDF, JPEG, PNG hoặc WebP làm bằng chứng xác minh.');
  }
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    throw new Error('Bằng chứng phải lớn hơn 0 và không quá 10MB.');
  }
}

function safeEvidenceFileName(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin';
  return `${crypto.randomUUID()}.${safeExtension}`;
}

export async function getPropertyVerificationCases(status?: PropertyVerificationCase['status']): Promise<PropertyVerificationCase[]> {
  let query = supabase
    .from('property_verification_cases')
    .select('*, properties(id,title,is_active,verification_status,verified_until)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PropertyVerificationCase[];
}

export async function getPropertyVerificationEvidence(caseId: string): Promise<PropertyVerificationEvidence[]> {
  const { data, error } = await supabase
    .from('property_verification_evidence')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PropertyVerificationEvidence[];
}

export async function getPropertyVerificationEvents(caseId: string): Promise<PropertyVerificationEvent[]> {
  const { data, error } = await supabase
    .from('property_verification_events')
    .select('*')
    .eq('case_id', caseId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PropertyVerificationEvent[];
}

export async function openPropertyVerificationCase(input: VerificationCaseInput): Promise<PropertyVerificationCase> {
  const { data, error } = await supabase.rpc('open_property_verification_case', {
    p_property_id: input.propertyId,
    p_scope_codes: input.scopeCodes,
    p_public_reason_codes: input.publicReasonCodes,
    p_user_listing_id: input.userListingId ?? null,
  }).single();
  if (error) throw error;
  return data as PropertyVerificationCase;
}

export async function uploadPropertyVerificationEvidence(
  caseId: string,
  kind: PropertyVerificationEvidence['kind'],
  file: File,
): Promise<PropertyVerificationEvidence> {
  assertVerificationEvidenceFile(file);
  const storagePath = `cases/${caseId}/${safeEvidenceFileName(file)}`;
  const { error: uploadError } = await supabase.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc('add_property_verification_evidence', {
    p_case_id: caseId,
    p_kind: kind,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  }).single();
  if (error) {
    await supabase.storage.from(VERIFICATION_EVIDENCE_BUCKET).remove([storagePath]);
    throw error;
  }
  return data as PropertyVerificationEvidence;
}

export async function submitPropertyVerificationCase(caseId: string): Promise<PropertyVerificationCase> {
  const { data, error } = await supabase.rpc('submit_property_verification_case', { p_case_id: caseId }).single();
  if (error) throw error;
  return data as PropertyVerificationCase;
}

export async function decidePropertyVerificationCase(
  caseId: string,
  decision: 'verified' | 'rejected',
  publicReasonCodes: string[],
  verifiedUntil: string | null,
  decisionNoteInternal: string,
): Promise<PropertyVerificationCase> {
  const { data, error } = await supabase.rpc('decide_property_verification_case', {
    p_case_id: caseId,
    p_decision: decision,
    p_public_reason_codes: publicReasonCodes,
    p_verified_until: verifiedUntil,
    p_decision_note_internal: decisionNoteInternal,
  }).single();
  if (error) throw error;
  return data as PropertyVerificationCase;
}

export async function revokePropertyVerificationCase(caseId: string, note: string): Promise<PropertyVerificationCase> {
  const { data, error } = await supabase.rpc('revoke_property_verification_case', {
    p_case_id: caseId,
    p_note_internal: note,
  }).single();
  if (error) throw error;
  return data as PropertyVerificationCase;
}
