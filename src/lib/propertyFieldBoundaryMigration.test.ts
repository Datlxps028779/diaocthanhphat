import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915170000_property_field_boundary_audit.sql'),
  'utf8',
);

describe('property field boundary migration', () => {
  it('creates a bounded immutable audit table without public reads', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.property_change_audit_events');
    expect(migration).toContain('changed_fields text[] NOT NULL');
    expect(migration).toContain('REVOKE ALL ON TABLE public.property_change_audit_events FROM PUBLIC, anon, authenticated');
    expect(migration).not.toContain('GRANT SELECT ON TABLE public.property_change_audit_events TO authenticated');
  });

  it('excludes contact and system fields from audit payloads', () => {
    expect(migration).toContain("'contact_name', 'contact_phone', 'contact_zalo'");
    expect(migration).toContain("v_before - v_sensitive");
    expect(migration).toContain("v_after - v_sensitive");
  });

  it('enforces separate edit, SEO, media, and publish boundaries', () => {
    expect(migration).toContain('prevent_staff_property_field_escalation');
    expect(migration).toContain("'properties', 'manage_seo'");
    expect(migration).toContain("'properties', 'manage_media'");
    expect(migration).toContain("'properties', 'publish'");
    expect(migration).toContain("key <> 'updated_at'");
    expect(migration).toContain('field NOT IN');
  });

  it('does not revoke or mutate existing property data', () => {
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE|TRUNCATE)\s+public\.properties/im);
    expect(migration).toContain('BEFORE UPDATE ON public.properties');
    expect(migration).toContain('AFTER UPDATE ON public.properties');
  });
});
