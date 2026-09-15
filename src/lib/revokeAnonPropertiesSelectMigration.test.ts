import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915190000_revoke_anon_properties_table_select.sql'),
  'utf8',
);

describe('anon properties select revoke migration', () => {
  it('revokes only anon direct reads and keeps the public projection grant', () => {
    expect(migration).toContain('REVOKE SELECT ON TABLE public.properties FROM anon');
    expect(migration).toContain('REVOKE SELECT (contact_name, contact_phone, contact_zalo)');
    expect(migration).toContain('GRANT SELECT ON public.public_properties TO anon, authenticated');
  });

  it('does not mutate property rows or revoke authenticated writer access', () => {
    expect(migration).not.toMatch(/\b(INSERT INTO|UPDATE public\.properties|DELETE FROM public\.properties)\b/i);
    expect(migration).not.toMatch(/FROM authenticated/i);
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
