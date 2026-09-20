import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const migration = readFileSync('supabase/migrations/20261010000000_public_property_card_posters.sql', 'utf8');

describe('poster SQL source contract (not a database runtime test)', () => {
  it('keeps the output allowlist, definer search path and role grants explicit', () => {
    const fields = migration.match(/RETURNS TABLE \(([\s\S]*?)\)/)?.[1].trim().split(',').map(s => s.trim().split(/\s+/)[0]);
    expect(fields).toEqual(['property_id','display_name','avatar_url','profile_slug','attribution_kind']);
    expect(migration).toContain('STABLE\nSECURITY DEFINER\nSET search_path = public, pg_temp');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO anon, authenticated');
  });
  it('bounds raw input and gates exact owner, active property, approved listing and published user profile', () => {
    expect(migration.indexOf('cardinality(p_property_ids)')).toBeLessThan(migration.indexOf('unnest(p_property_ids)'));
    for (const gate of ["ERRCODE = '22023'", 'count(DISTINCT ul.user_id)', 'ac.owner_count = 1', 'pp.is_active = true', "approved.status = 'approved'", "owner_profile.role = 'user'", "ap.status = 'published'", "btrim(ap.display_name) <> ''"]) expect(migration).toContain(gate);
    expect(migration).not.toMatch(/min\(ul\.user_id\)/i);
    expect(migration).not.toMatch(/ALTER TABLE|CREATE POLICY|INSERT INTO|DELETE FROM|UPDATE public\./i);
  });
});
