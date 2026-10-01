import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014110000_commerce_catalog_read_model.sql'),
  'utf8',
);

describe('commerce catalog read model migration', () => {
  it('gates catalog and checkout through server-owned purchasable state', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS is_purchasable boolean');
    expect(migration).toContain('DEFAULT false');
    expect(migration).toContain('commerce_get_catalog()');
    expect(migration).toContain("v.status = 'active'");
    expect(migration).toContain('v.is_purchasable = true');
    expect(migration).toContain('p.is_active = true');
  });

  it('returns only comparison-safe fields and package benefits', () => {
    expect(migration).toContain('package_version_id');
    expect(migration).toContain('unit_amount_minor');
    expect(migration).toContain('tax_rate_basis_points');
    expect(migration).toContain('benefits');
    expect(migration).not.toContain('provider_metadata');
    expect(migration).not.toContain('owner_user_id');
    expect(migration).not.toContain('package_snapshot');
  });

  it('keeps catalog read-only and provider-independent', () => {
    expect(migration).toContain('LANGUAGE sql');
    expect(migration).toContain('STABLE');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_get_catalog() FROM PUBLIC');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_get_catalog() TO anon, authenticated;');
    expect(migration).not.toContain('payos');
  });
});
