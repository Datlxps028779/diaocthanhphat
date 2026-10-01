import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014140000_commerce_wallet_fee_lifecycle.sql'),
  'utf8',
);

describe('commerce wallet listing fee lifecycle migration', () => {
  it('reserves server-priced default basic fee under wallet lock', () => {
    expect(migration).toContain('commerce_reserve_listing_fee_internal(');
    expect(migration).toContain("product_kind = 'listing_basic'");
    expect(migration).toContain('is_default = true');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('Insufficient available wallet balance.');
    expect(migration).toContain('available_minor = w.available_minor - v_total');
    expect(migration).toContain('reserved_minor = w.reserved_minor + v_total');
    expect(migration).toContain("'fee_reserve'");
  });

  it('captures only after approved listing with active property', () => {
    expect(migration).toContain('commerce_capture_listing_fee_internal(');
    expect(migration).toContain("l.status = 'approved'");
    expect(migration).toContain('p.is_active = true');
    expect(migration).toContain('reserved_minor = w.reserved_minor - v_reservation.total_minor');
    expect(migration).toContain("SET status = 'captured'");
    expect(migration).toContain("'fee_capture'");
    expect(migration).toContain("receipt_kind, document_type");
    expect(migration).toContain("'listing_fee', 'internal_receipt'");
  });

  it('releases reserved money for rejected expired or deleted pending listings', () => {
    expect(migration).toContain('commerce_release_listing_fee_internal(');
    expect(migration).toContain("p_reason NOT IN ('rejected','expired','deleted','timeout','free_approval')");
    expect(migration).toContain('available_minor = w.available_minor + v_reservation.total_minor');
    expect(migration).toContain('reserved_minor = w.reserved_minor - v_reservation.total_minor');
    expect(migration).toContain("'fee_release'");
  });

  it('integrates insert update delete lifecycle without charging free owners', () => {
    expect(migration).toContain('sync_commerce_wallet_listing_fee_lifecycle()');
    expect(migration).toContain('commerce_wallet_accounts');
    expect(migration).toContain("NEW.status = 'pending'");
    expect(migration).toContain("NEW.status = 'approved'");
    expect(migration).toContain("NEW.status IN ('rejected','expired')");
    expect(migration).toContain("TG_OP = 'DELETE'");
    expect(migration).toContain('trg_commerce_wallet_listing_fee_lifecycle');
    expect(migration).toContain('trg_commerce_wallet_listing_fee_delete');
  });

  it('keeps internal helpers private and explicit reserve owner-only', () => {
    for (const signature of [
      'commerce_reserve_listing_fee_internal(uuid, uuid, text, text, timestamptz)',
      'commerce_capture_listing_fee_internal(uuid, uuid)',
      'commerce_release_listing_fee_internal(uuid, uuid, text)',
      'sync_commerce_wallet_listing_fee_lifecycle()',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
    }
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_reserve_listing_fee(uuid, text, text, timestamptz) TO authenticated;');
  });
});
