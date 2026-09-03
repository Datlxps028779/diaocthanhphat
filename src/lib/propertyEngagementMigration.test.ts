import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260925000000_property_engagement_and_phone_reveal.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_property_engagement_dry_run.sql'),
  'utf8',
);
const propertiesApi = readFileSync(resolve(process.cwd(), 'src/lib/api/properties.ts'), 'utf8');

describe('property engagement migration', () => {
  it('creates a deduplicated, private reveal event table', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.property_phone_reveal_events');
    expect(migration).toContain('REFERENCES public.properties(id) ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES public.leads(id) ON DELETE CASCADE');
    expect(migration).toContain('uq_property_phone_reveal_session_day');
    expect(migration).toContain('ALTER TABLE public.property_phone_reveal_events ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.property_phone_reveal_events FROM PUBLIC, anon, authenticated');
  });

  it('keeps reveal and aggregate RPCs server-authorized', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.public_reveal_property_phone');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain("public_rate_limit_allow('property_phone_reveal', 10, 60)");
    expect(migration).toContain("source, user_id");
    expect(migration).toContain("'property_phone_reveal'");
    expect(migration).toContain('WHERE ul.user_id = auth.uid()');
    expect(migration).toContain("IF auth.uid() IS NULL OR NOT public.is_admin()");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.public_reveal_property_phone(uuid, text, text, text) TO anon, authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_my_property_engagement() TO authenticated');
  });

  it('does not expose the property phone through the poster RPC', () => {
    expect(migration).toContain('NULL::text AS public_phone');
    expect(migration).not.toContain('ap.public_phone, ap.public_zalo');
    expect(migration).toContain('NULLIF(btrim(p.contact_phone), \'\')');
    expect(migration).toContain('RETURN QUERY SELECT v_property_phone, true');
    expect(migration).not.toContain('SELECT l.phone');
    expect(migration).not.toContain('RETURN QUERY SELECT v_phone');
  });

  it('uses explicit public projections and no client counter fallback', () => {
    const publicProjection = propertiesApi.match(/export const PUBLIC_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    expect(publicProjection).not.toContain('contact_name');
    expect(publicProjection).not.toContain('contact_phone');
    expect(publicProjection).not.toContain('contact_zalo');
    expect(propertiesApi).not.toContain(".update({ views: (data?.views ?? 0) + 1 })");
    expect(propertiesApi).toContain('public_reveal_property_phone');
  });

  it('keeps the preflight read-only and checks grants and duplicate groups', () => {
    expect(dryRun).toContain('to_regclass');
    expect(dryRun).toContain('HAVING COUNT(*) > 1');
    expect(dryRun).toContain('has_function_privilege');
    expect(dryRun).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  });
});
