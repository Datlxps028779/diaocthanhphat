import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261015020000_commerce_closed_rollout_guards.sql'),
  'utf8',
);

const walletTab = readFileSync(
  resolve(process.cwd(), 'src/components/admin/tabs/CommerceWalletTab.tsx'),
  'utf8',
);

const approvalTab = readFileSync(
  resolve(process.cwd(), 'src/components/admin/tabs/UserListingsApprovalTab.tsx'),
  'utf8',
);

const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_closed_rollout_verify.sql'),
  'utf8',
);

const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_closed_rollout_dry_run.sql'),
  'utf8',
);describe('commerce closed rollout guards', () => {
  it('fails closed before adding inactive-only constraints when active catalog exists', () => {
    expect(migration).toContain('commerce_wallet_topup_options WHERE is_active = true');
    expect(migration).toContain('commerce_fee_products WHERE is_active = true OR is_default = true');
    expect(migration).toContain('commerce_fee_product_rules WHERE is_active = true');
    expect(migration).toContain('commerce_wallet_topup_options_closed_rollout_inactive_check');
    expect(migration).toContain('commerce_fee_products_closed_rollout_inactive_check');
    expect(migration).toContain('commerce_fee_products_closed_rollout_default_check');
    expect(migration).toContain('commerce_fee_product_rules_closed_rollout_inactive_check');
  });

  it('rejects paid approvals at both the resolver and decision table boundary', () => {
    expect(migration).toContain('commerce_reject_paid_listing_approval_insert');
    expect(migration).toContain('commerce_closed_rollout_reject_paid_approval');
    expect(migration).toContain("NEW.fee_mode = 'paid'");
    expect(migration).toContain('Paid listing approval is not available in this rollout.');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.commerce_resolve_listing_fee_product(');
    expect(migration).not.toContain('INSERT INTO public.commerce_listing_approval_fee_decisions');
  });

  it('does not mutate or seed commerce data and preserves historical paid schema', () => {
    expect(migration).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+INTO?\b/i);
    expect(migration).not.toMatch(/commerce_listing_approval_fee_decisions.*DROP/i);
    expect(migration).not.toContain('tax_invoice');
    expect(migration).not.toContain('PayOS');
  });

  it('keeps the manual verification script read-only and policy-specific', () => {
    for (const sql of [dryRun, verify]) {
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/im);
    }
    expect(dryRun).toContain('preflight_pass');
    expect(verify).toContain('commerce_closed_rollout_verify_pass');
    expect(verify).toContain('paid_decision_trigger_present');
    expect(verify).toContain('wallet_receipts_internal_only');
  });

  it('keeps Wallet admin records visibly draft-only', () => {
    expect(walletTab).toContain('isActive: false');
    expect(walletTab).toContain('isDefault: false');
    expect(walletTab).toContain('Draft inactive');
    expect(walletTab).not.toContain('Hiển thị trong catalog public');
    expect(walletTab).not.toContain('Active catalog');
    expect(walletTab).not.toContain('Mặc định listing_basic');
  });

  it('keeps listing approval UI free-only and does not load paid options', () => {
    expect(approvalTab).toContain("feeMode: 'free'");
    expect(approvalTab).toContain('Paid approval và trừ Wallet chưa mở');
    expect(approvalTab).not.toContain('getListingApprovalFeeOptions');
    expect(approvalTab).not.toContain('Trả phí từ ví');
    expect(approvalTab).not.toContain('approvalProductCode');
    expect(approvalTab).not.toContain('approvalOptions');
  });
});
