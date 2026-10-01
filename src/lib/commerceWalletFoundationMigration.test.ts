import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014120000_commerce_wallet_foundation.sql'),
  'utf8',
);

describe('commerce wallet foundation migration', () => {
  it('creates wallet, top-up, fee and receipt tables without production seed', () => {
    for (const table of [
      'commerce_wallet_accounts',
      'commerce_wallet_topup_config',
      'commerce_wallet_topup_options',
      'commerce_wallet_topup_intents',
      'commerce_fee_products',
      'commerce_wallet_fee_reservations',
      'commerce_wallet_ledger',
      'commerce_wallet_receipts',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.commerce_wallet_topup_options/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.commerce_fee_products/i);
  });

  it('separates available and reserved balance using VND integer units', () => {
    expect(migration).toContain('available_minor bigint NOT NULL DEFAULT 0');
    expect(migration).toContain('reserved_minor bigint NOT NULL DEFAULT 0');
    expect(migration).toContain("currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND')");
    expect(migration).toContain('available_minor >= 0');
    expect(migration).toContain('reserved_minor >= 0');
  });

  it('supports fixed and server-bounded custom top-ups', () => {
    expect(migration).toContain('custom_amount_enabled boolean NOT NULL DEFAULT false');
    expect(migration).toContain('custom_min_minor bigint');
    expect(migration).toContain('custom_max_minor bigint');
    expect(migration).toContain('custom_step_minor bigint');
    expect(migration).toContain('option_code text');
    expect(migration).toContain("source_kind text NOT NULL CHECK (source_kind IN ('fixed_option','custom_amount'))");
  });

  it('models basic fees and add-ons without organic ranking flags', () => {
    expect(migration).toContain("product_kind text NOT NULL CHECK (product_kind IN ('listing_basic','sponsored_addon'))");
    expect(migration).toContain('duration_days integer');
    expect(migration).toContain('placement_code text');
    expect(migration).toContain('sponsored_label text');
    expect(migration).not.toContain('is_hot');
    expect(migration).not.toContain('is_featured');
  });

  it('records reserve, capture and release in an append-only ledger', () => {
    expect(migration).toContain("operation text NOT NULL CHECK (operation IN (");
    expect(migration).toContain("'topup_credit','fee_reserve','fee_capture','fee_release'");
    expect(migration).toContain('user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL');
    expect(migration).toContain('guard_commerce_wallet_ledger_append_only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.commerce_wallet_ledger');
    expect(migration).toContain('UNIQUE (owner_user_id, idempotency_key)');
  });

  it('keeps top-up money non-withdrawable and receipts non-tax', () => {
    expect(migration).not.toMatch(/commerce_wallet_withdraw|commerce_withdraw|operation[^\n]*'withdraw'|bank_refund|refund_request/i);
    expect(migration).toContain("receipt_kind text NOT NULL CHECK (receipt_kind IN ('wallet_topup','listing_fee'))");
    expect(migration).toContain("document_type text NOT NULL DEFAULT 'internal_receipt'");
    expect(migration).toContain("CHECK (document_type = 'internal_receipt')");
  });

  it('enables RLS and grants no client writes', () => {
    expect((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length).toBe(8);
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+(anon|authenticated)/i);
  });
});
