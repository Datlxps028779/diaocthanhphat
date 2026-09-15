import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915180000_public_properties_projection.sql'),
  'utf8',
);

describe('public properties projection migration', () => {
  it('creates a security-barrier projection and grants only reads', () => {
    expect(migration).toContain('CREATE OR REPLACE VIEW public.public_properties');
    expect(migration).toContain('security_barrier = true');
    expect(migration).toContain('GRANT SELECT ON public.public_properties TO anon, authenticated');
  });

  it('does not expose contact fields through the projection', () => {
    const selectBody = migration.split('FROM public.properties AS p')[0];
    expect(selectBody).not.toMatch(/p\.contact_(?:name|phone|zalo)/);
  });

  it('does not revoke the base table before readers are rewired', () => {
    expect(migration).not.toMatch(/^\s*REVOKE\s+SELECT\s+ON\s+public\.properties\s+FROM\s+anon/im);
  });
});
