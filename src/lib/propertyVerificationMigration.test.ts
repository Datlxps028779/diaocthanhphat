import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260904000000_property_verification_cases.sql'),
  'utf8',
);

describe('P7 property verification migration contract', () => {
  it('creates additive case, private evidence, and append-only audit records', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.property_verification_cases');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.property_verification_evidence');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.property_verification_events');
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.property_verification_events[\s\S]+ON DELETE RESTRICT/s);
    expect(migration).toContain("event_type IN ('opened', 'evidence_added', 'submitted', 'verified', 'rejected', 'revoked', 'withdrawn', 'superseded')");
  });

  it('keeps evidence private and forbids direct public table writes', () => {
    expect(migration).toContain("VALUES ('verification-evidence', 'verification-evidence', false)");
    expect(migration).toContain("bucket_id = 'verification-evidence' AND public.is_owner_mfa()");
    expect(migration).toContain("metadata ->> 'mimetype' IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')");
    expect(migration).toContain("Bằng chứng trong kho không khớp metadata đã khai báo");
    expect(migration).toContain("REVOKE ALL ON TABLE public.property_verification_cases FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("REVOKE ALL ON TABLE public.property_verification_evidence FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("REVOKE ALL ON TABLE public.property_verification_events FROM PUBLIC, anon, authenticated;");
    expect(migration).not.toContain('GRANT INSERT ON TABLE public.property_verification');
    expect(migration).not.toContain('GRANT UPDATE ON TABLE public.property_verification');
  });

  it('uses locked, owner-MFA database transitions and fixed search paths', () => {
    for (const fn of [
      'open_property_verification_case',
      'add_property_verification_evidence',
      'submit_property_verification_case',
      'decide_property_verification_case',
      'revoke_property_verification_case',
    ]) expect(migration).toContain(`FUNCTION public.${fn}`);
    expect(migration).toContain('PERFORM public.property_verification_actor_role();');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.decide_property_verification_case(uuid, text, text[], timestamptz, text) FROM PUBLIC, anon;");
  });

  it('blocks generic boolean writes and never fabricates historic evidence', () => {
    expect(migration).toContain('guard_property_verification_projection');
    expect(migration).toContain('property_verification_internal_write_enabled');
    expect(migration).toContain("Trạng thái xác minh chỉ được thay đổi qua quy trình hồ sơ xác minh");
    expect(migration).not.toMatch(/INSERT INTO public\.property_verification_cases\s*\([^;]+?\)\s*SELECT\b/s);
    expect(migration).toContain("The legacy boolean remains a database-managed compatibility projection only.");
  });

  it('requires evidence, reviewer, public scope, and expiry before public verified state', () => {
    expect(migration).toContain("Cần ít nhất một bằng chứng trước khi gửi duyệt");
    expect(migration).toContain("Hồ sơ đã xác minh cần lý do công khai hợp lệ và thời hạn còn hiệu lực");
    expect(migration).toContain("verification_status = 'verified'");
    expect(migration).toContain('verified_until = p_verified_until');
  });

  it('keeps evidence and audit history immutable and supersedes verified scope changes', () => {
    expect(migration).toContain('trg_guard_property_verification_evidence_history');
    expect(migration).toContain('trg_guard_property_verification_events_history');
    expect(migration).toContain('Lịch sử hồ sơ xác minh là bất biến');
    expect(migration).toContain('supersede_property_verification_for_changed_scope');
    expect(migration).toContain('trg_supersede_property_verification_on_scope_change');
    expect(migration).toContain("'property_fields_changed'");
    expect(migration).toContain("'document_reference_reviewed' = ANY(c.scope_codes)");
  });

  it('rejects null scope entries instead of allowing SQL three-valued checks to pass', () => {
    expect(migration).toContain('array_position(p_scope_codes, NULL) IS NOT NULL');
    expect(migration).toContain('array_position(coalesce(p_public_reason_codes,');
    expect(migration).toContain('array_position(scope_codes, NULL) IS NULL');
  });

  it('provides a system expiry transition that clears the public projection', () => {
    expect(migration).toContain('FUNCTION public.expire_property_verification_cases()');
    expect(migration).toContain("jsonb_build_object('reason', 'expired')");
    expect(migration).toContain("verification_status = 'unverified'");
    expect(migration).toContain("auth.uid() IS NOT NULL AND NOT public.is_admin()");
    expect(migration).toContain("cron.schedule('expire-property-verification-cases', '13 * * * *'");
  });
});
