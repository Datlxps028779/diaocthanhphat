import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260905020000_property_panoramas.sql'),
  'utf8',
);

describe('property panoramas migration', () => {
  it('creates a private bucket and an isolated panorama relation', () => {
    expect(migration).toContain("VALUES ('property-360', 'property-360', false)");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.property_panoramas');
    expect(migration).toContain('REFERENCES public.properties(id) ON DELETE CASCADE');
    expect(migration).toContain("mime_type IN ('image/jpeg', 'image/webp')");
    expect(migration).toContain('width::numeric / NULLIF(height, 0) BETWEEN 1.8 AND 2.2');
  });

  it('limits public reads to active panoramas on active properties', () => {
    expect(migration).toContain('CREATE POLICY property_panoramas_public_select');
    expect(migration).toContain('is_active\n    AND EXISTS');
    expect(migration).toContain('p.is_active = true');
    expect(migration).toContain('CREATE POLICY property_360_admin_select ON storage.objects');
    expect(migration).not.toMatch(/property_360_public_select/i);
  });

  it('restricts storage writes to admins and property-scoped image paths', () => {
    expect(migration).toContain("name ~ '^[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$'");
    expect(migration).toContain('public.is_admin()');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.set_property_panoramas_updated_at() FROM PUBLIC, anon, authenticated;');
  });
});
