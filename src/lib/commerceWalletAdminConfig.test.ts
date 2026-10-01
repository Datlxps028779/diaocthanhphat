import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014180000_commerce_wallet_admin_config.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_wallet_admin_config_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_wallet_admin_config_verify.sql'),
  'utf8',
);
const adminTab = readFileSync(
  resolve(process.cwd(), 'src/components/admin/tabs/CommerceWalletTab.tsx'),
  'utf8',
);

describe('commerce wallet admin configuration', () => {
  it('gates every configuration RPC by the commerce-wallet permission', () => {
    expect(migration).toContain("has_staff_permission('commerce-wallet', 'view')");
    expect(migration).toContain("has_staff_permission('commerce-wallet', 'edit')");
    expect(migration).toContain("('commerce-wallet', 'view', 'Ví & thanh toán')");
    expect(migration).toContain("('commerce-wallet', 'edit', 'Ví & thanh toán')");
    expect(migration).toContain('SET search_path = public, pg_temp');
  });

  it('keeps top-up activation closed and validates server-owned amounts', () => {
    expect(migration).toContain("p_is_active IS DISTINCT FROM false");
    expect(migration).toContain('p_custom_min_minor <= 0');
    expect(migration).toContain('p_amount_minor > 9007199254740991');
    expect(migration).toContain('p_custom_max_minor < p_custom_min_minor');
  });

  it('preserves fee identity and records configuration audit events', () => {
    expect(migration).toContain('Fee identity, amount and terms are immutable; create a new version instead.');
    expect(migration).toContain('commerce_audit_events');
    expect(migration).toContain('commerce_wallet_fee_product_created');
    expect(migration).toContain('commerce_wallet_fee_product_updated');
  });

  it('does not expose direct table grants for admin configuration', () => {
    expect(migration).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.commerce_wallet/i);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_admin_get_wallet_configuration() TO authenticated;');
  });

  it('keeps manual preflight and verification scripts read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/im);
    }
    expect(dryRun).toContain('commerce_wallet_admin_config_preflight_pass');
    expect(verify).toContain('commerce_wallet_admin_config_verify_pass');
    expect(verify).toContain('topup_activation_closed');
  });

  it('renders separate read/edit sections without enabling real top-up', () => {
    expect(adminTab).toContain('Cấu hình nạp tiền');
    expect(adminTab).toContain('Mệnh giá nạp');
    expect(adminTab).toContain('Biểu phí dịch vụ');
    expect(adminTab).toContain('Nạp tiền vẫn bị khóa');
    expect(adminTab).toContain('commerce-wallet / edit');
  });
});
