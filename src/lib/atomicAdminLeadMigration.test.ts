import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916000000_atomic_admin_create_lead.sql'),
  'utf8',
);

describe('atomic admin lead migration', () => {
  it('derives the actor at the database boundary and requires team access', () => {
    expect(migration).toContain('v_actor uuid := auth.uid();');
    expect(migration).toContain('NOT public.is_admin_or_staff()');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain("p.role IN ('admin', 'staff')");
  });

  it('creates the lead, assignments, and created activity in one function', () => {
    expect(migration).toContain('INSERT INTO public.leads');
    expect(migration).toContain('INSERT INTO public.lead_assignments');
    expect(migration).toContain('INSERT INTO public.lead_activities');
    expect(migration).toContain("VALUES (v_lead.id, 'created', 'Tạo khách thủ công', p_author)");
  });

  it('does not expose the RPC to anonymous callers', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.admin_create_lead');
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated');
  });
});
