import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'supabase/functions/ai-verification/index.ts'), 'utf8');

describe('ai-verification Edge Function contract', () => {
  it('authenticates owner MFA and accepts only a case ID', () => {
    expect(source).toContain('verifyAdmin(req, createClient)');
    expect(source).toContain('const caseId = (body as Record<string, unknown>).caseId;');
    expect(source).not.toContain('verifyAdminOrStaff(req, createClient)');
    expect(source).not.toContain('propertyId');
    expect(source).not.toContain('evidenceContent');
  });

  it('reads server-side evidence metadata without changing verification state', () => {
    expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain('.from("property_verification_cases").select("id,status,scope_codes")');
    expect(source).toContain('.from("property_verification_evidence").select("id,case_id,kind")');
    expect(source).not.toContain('.update(');
    expect(source).not.toContain('.insert(');
    expect(source).not.toContain('verification_status');
    expect(source).not.toContain('verified_until');
    expect(source).not.toContain('storage.download');
  });
});
