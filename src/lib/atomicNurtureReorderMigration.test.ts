import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260917000000_atomic_reorder_nurture_steps.sql'),
  'utf8',
);
const api = readFileSync(resolve(process.cwd(), 'src/lib/api/nurture.ts'), 'utf8');

describe('atomic nurture reorder contract', () => {
  it('guards the RPC with the authenticated admin/staff boundary', () => {
    expect(migration).toContain('v_actor uuid := auth.uid();');
    expect(migration).toContain('v_actor IS NULL OR NOT public.is_admin_or_staff()');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.admin_reorder_nurture_steps(uuid[]) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.admin_reorder_nurture_steps(uuid[]) TO authenticated');
  });

  it('rejects incomplete, duplicate, null, and empty reorder lists', () => {
    expect(migration).toContain('p_step_ids IS NULL OR cardinality(p_step_ids) = 0');
    expect(migration).toContain('requested.step_id IS NULL');
    expect(migration).toContain('v_input_count <> v_distinct_count');
    expect(migration).toContain('v_input_count <> v_step_count');
    expect(migration).toContain('v_matching_count <> v_step_count');
  });

  it('writes every ordinal in one transaction-scoped update', () => {
    expect(migration).toContain('LOCK TABLE public.nurture_drip_step IN SHARE ROW EXCLUSIVE MODE');
    expect(migration).toContain('SET sort_order = requested.position - 1');
    expect(migration).toContain('FROM unnest(p_step_ids) WITH ORDINALITY');
    expect(api).toContain("supabase.rpc('admin_reorder_nurture_steps'");
    expect(api).not.toContain('Promise.all(ids.map');
  });
});
