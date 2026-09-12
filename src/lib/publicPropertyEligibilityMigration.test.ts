import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912020000_harden_public_property_eligibility.sql'),
  'utf8',
);

describe('public Product eligibility boundary migration', () => {
  it('replaces the broad active-only public policy with the canonical URL gate', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "public_select_properties" ON public.properties');
    expect(migration).toContain('CREATE POLICY "public_select_properties" ON public.properties');
    expect(migration).toContain('is_active = true');
    expect(migration).toContain('public_code IS NOT NULL');
    expect(migration).toContain('public_code > 0');
    expect(migration).toContain("btrim(coalesce(slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
    expect(migration).toContain("listing_type::text IN ('mua_ban', 'cho_thue')");
    expect(migration).toContain('FROM public.areas AS area');
    expect(migration).toContain("btrim(coalesce(area.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
  });

  it('does not broaden write access or touch staff/admin policies', () => {
    expect(migration).not.toMatch(/CREATE POLICY.*FOR (INSERT|UPDATE|DELETE)/i);
    expect(migration).not.toContain('properties_staff_permission_');
    expect(migration).not.toContain('GRANT');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
