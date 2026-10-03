import { describe, expect, it } from 'vitest';
import {
  normalizeCommerceAccountSnapshot,
  normalizeCommerceListingApprovalFeeOptions,
  normalizeCommerceOperationsAlertDetail,
  normalizeCommerceOperationsQueueHealth,
  normalizeCommerceWalletCatalog,
  normalizeCommerceWalletSnapshot,
} from './commerce';

describe('commerce account API', () => {
  it('normalizes the owner snapshot without inventing records', () => {
    const snapshot = normalizeCommerceAccountSnapshot({
      orders: [{ id: 'order-1' }],
      payments: [{ id: 'payment-1' }],
      entitlements: [{ id: 'entitlement-1' }],
      quotaLedger: [{ id: 'ledger-1' }],
      subscriptions: [],
      subscriptionPeriods: [],
      invoices: [],
      refunds: [],
      notifications: [{ id: 'notification-1' }],
      unreadNotifications: 1,
      generatedAt: '2026-09-26T00:00:00.000Z',
    });

    expect(snapshot.orders).toHaveLength(1);
    expect(snapshot.payments).toHaveLength(1);
    expect(snapshot.entitlements).toHaveLength(1);
    expect(snapshot.notifications).toHaveLength(1);
    expect(snapshot.unreadNotifications).toBe(1);
  });

  it('defaults missing optional collections and unread count safely', () => {
    const snapshot = normalizeCommerceAccountSnapshot({ generatedAt: '2026-09-26T00:00:00.000Z' });
    expect(snapshot.orders).toEqual([]);
    expect(snapshot.payments).toEqual([]);
    expect(snapshot.entitlements).toEqual([]);
    expect(snapshot.quotaLedger).toEqual([]);
    expect(snapshot.notifications).toEqual([]);
    expect(snapshot.unreadNotifications).toBe(0);
  });

  it('normalizes aggregate operations queue health and drops unknown fields', () => {
    const health = normalizeCommerceOperationsQueueHealth({
      generatedAt: '2026-10-03T00:00:00.000Z',
      outbox: { pending: 1, processing: 2, retry: 3, dead_letter: 4, sent: 5, oldest_actionable_at: null, provider_message_id: 'secret' },
      email: { pending: 0, processing: 1, retry: 0, dead_letter: 1, sent: 8, oldest_actionable_at: '2026-10-03T00:00:00.000Z', recipient_email: 'hidden@example.com' },
      payload: 'ignored',
    });
    expect(health.outbox).toEqual({ pending: 1, processing: 2, retry: 3, dead_letter: 4, sent: 5, oldest_actionable_at: null });
    expect(health.email.oldest_actionable_at).toBe('2026-10-03T00:00:00.000Z');
    expect(JSON.stringify(health)).not.toContain('provider_message_id');
    expect(JSON.stringify(health)).not.toContain('recipient_email');
  });

  it('rejects invalid queue health counts and shape', () => {
    expect(() => normalizeCommerceOperationsQueueHealth(null)).toThrow('Commerce operations queue health is invalid.');
    expect(() => normalizeCommerceOperationsQueueHealth({ generatedAt: 'now', outbox: {}, email: {} })).toThrow('Commerce operations queue count is invalid.');
    expect(() => normalizeCommerceOperationsQueueHealth({
      generatedAt: 'now',
      outbox: { pending: -1, processing: 0, retry: 0, dead_letter: 0, sent: 0, oldest_actionable_at: null },
      email: { pending: 0, processing: 0, retry: 0, dead_letter: 0, sent: 0, oldest_actionable_at: null },
    })).toThrow('Commerce operations queue count is invalid.');
  });

  it('normalizes a sanitized operations detail chain', () => {
    const detail = normalizeCommerceOperationsAlertDetail({
      alert: { id: 'alert-1', status: 'open' },
      paymentAttempt: { id: 'payment-1' },
      order: { id: 'order-1', owner_user_id: 'owner-1' },
      paymentEvents: [{ id: 'event-1' }],
      entitlements: [{ id: 'entitlement-1' }],
      quotaReservations: [{ id: 'reservation-1' }],
      listings: [{ id: 'listing-1' }],
      properties: [{ id: 'property-1' }],
      notifications: [{ id: 'notification-1' }],
      emailDeliveries: [{ id: 'email-1', status: 'retry' }],
      auditTimeline: [{ id: 'audit-1' }],
      generatedAt: '2026-09-26T00:00:00.000Z',
    });
    expect(detail.alert.id).toBe('alert-1');
    expect(detail.paymentAttempt?.id).toBe('payment-1');
    expect(detail.order?.id).toBe('order-1');
    expect(detail.entitlements).toHaveLength(1);
    expect(detail.listings).toHaveLength(1);
    expect(detail.emailDeliveries).toHaveLength(1);
  });

  it('rejects malformed operations detail payloads', () => {
    expect(() => normalizeCommerceOperationsAlertDetail(null)).toThrow('Commerce operations detail is invalid.');
    expect(() => normalizeCommerceOperationsAlertDetail({ alert: null })).toThrow('Commerce operations alert is invalid.');
  });

  it('normalizes only server-approved VND catalog entries', async () => {
    const { normalizeCommerceCatalog } = await import('./commerce');
    expect(normalizeCommerceCatalog([
      {
        package_id: 'package-1', package_code: 'pilot', package_name: 'Pilot', package_description: null,
        package_version_id: 'version-1', version: 1, currency: 'VND', billing_mode: 'one_time',
        billing_period_days: null, unit_amount_minor: 500000, tax_rate_basis_points: 0,
        terms_version: 'v1', benefits: [{ kind: 'listing_quota', quantity: 1 }],
      },
      { package_id: 'bad-currency', currency: 'USD', benefits: [] },
    ])).toHaveLength(1);
  });

  it('rejects empty or malformed catalog values without inventing packages', async () => {
    const { normalizeCommerceCatalog } = await import('./commerce');
    expect(normalizeCommerceCatalog(null)).toEqual([]);
    expect(normalizeCommerceCatalog([{ package_id: 'missing-fields' }])).toEqual([]);
  });

  it('normalizes fee options without deriving pricing on the client', () => {
    const options = normalizeCommerceListingApprovalFeeOptions({
      listing_id: 'listing-1',
      owner_user_id: 'owner-1',
      listing_type: 'mua_ban',
      property_type_id: 'house',
      available_minor: '95000',
      reserved_minor: 5000,
      products: [{
        rule_id: 'rule-1', fee_product_id: 'fee-1', code: 'listing_basic_30d', version: 3,
        name: 'Tin cơ bản 30 ngày', description: 'Điều khoản v3', amount_minor: 5000,
        currency: 'VND', duration_days: 30, terms_version: 'terms-v3', listing_type: 'mua_ban',
        property_type_id: 'house', priority: 10, rule_specificity: 'property_type',
      }],
    });
    expect(options.available_minor).toBe('95000');
    expect(options.products[0]?.amount_minor).toBe(5000);
    expect(options.products[0]?.terms_version).toBe('terms-v3');
  });

  it('rejects fee options without server identity fields', () => {
    expect(() => normalizeCommerceListingApprovalFeeOptions({ products: [] })).toThrow('Commerce listing approval fee options identity is invalid.');
  });
  it('normalizes wallet catalog and preserves server-priced products', () => {
    const catalog = normalizeCommerceWalletCatalog({
      config: {
        custom_amount_enabled: true,
        custom_min_minor: 100000,
        custom_max_minor: 5000000,
        custom_step_minor: 50000,
        currency: 'VND',
      },
      topupOptions: [{ code: 'topup_100k', label: '100.000 ₫', amount_minor: 100000, currency: 'VND' }],
      feeProducts: [{
        id: 'fee-1',
        code: 'listing_basic_30d',
        version: 1,
        name: 'Tin cơ bản 30 ngày',
        description: null,
        product_kind: 'listing_basic',
        amount_minor: 5000,
        currency: 'VND',
        duration_days: 30,
        placement_code: null,
        sponsored_label: null,
        terms_version: 'wallet-v1',
      }],
      generatedAt: '2026-09-29T00:00:00.000Z',
    });

    expect(catalog.topupOptions[0]?.amount_minor).toBe(100000);
    expect(catalog.feeProducts[0]?.product_kind).toBe('listing_basic');
    expect(catalog.config?.custom_amount_enabled).toBe(true);
  });

  it('normalizes wallet balances, movements and internal receipts', () => {
    const snapshot = normalizeCommerceWalletSnapshot({
      wallet: { currency: 'VND', available_minor: 95000, reserved_minor: 5000, updated_at: '2026-09-29T00:00:00.000Z' },
      topupIntents: [{
        id: 'topup-1', source_kind: 'fixed_option', option_code: 'topup_100k', requested_amount_minor: 100000,
        currency: 'VND', status: 'credited', credited_at: '2026-09-29T00:00:00.000Z', created_at: '2026-09-29T00:00:00.000Z', updated_at: '2026-09-29T00:00:00.000Z',
      }],
      feeReservations: [{
        id: 'reservation-1', user_listing_id: 'listing-1', submission_cycle: 1, total_minor: 5000,
        currency: 'VND', status: 'reserved', pricing_snapshot: [], expires_at: '2026-09-30T00:00:00.000Z',
        captured_at: null, released_at: null, created_at: '2026-09-29T00:00:00.000Z',
      }],
      ledger: [{
        id: 'ledger-1', operation: 'fee_reserve', amount_minor: 5000, currency: 'VND', available_after: 95000,
        reserved_after: 5000, topup_intent_id: null, fee_reservation_id: 'reservation-1', occurred_at: '2026-09-29T00:00:00.000Z',
      }],
      receipts: [{
        id: 'receipt-1', receipt_number: 'FEE-00000001', receipt_kind: 'listing_fee', document_type: 'internal_receipt',
        status: 'issued', amount_minor: 5000, currency: 'VND', issued_at: '2026-09-29T00:00:00.000Z', voided_at: null,
      }],
      generatedAt: '2026-09-29T00:00:00.000Z',
    });

    expect(snapshot.wallet.available_minor).toBe(95000);
    expect(snapshot.topupIntents[0]?.status).toBe('credited');
    expect(snapshot.feeReservations[0]?.status).toBe('reserved');
    expect(snapshot.ledger[0]?.operation).toBe('fee_reserve');
    expect(snapshot.receipts[0]?.document_type).toBe('internal_receipt');
  });

  it('defaults an absent wallet account to a zero VND balance', () => {
    const snapshot = normalizeCommerceWalletSnapshot({ generatedAt: '2026-09-29T00:00:00.000Z' });
    expect(snapshot.wallet).toEqual({ currency: 'VND', available_minor: 0, reserved_minor: 0, updated_at: null });
    expect(snapshot.topupIntents).toEqual([]);
    expect(snapshot.feeReservations).toEqual([]);
    expect(snapshot.ledger).toEqual([]);
    expect(snapshot.receipts).toEqual([]);
  });

  it('rejects malformed wallet payloads', () => {
    expect(() => normalizeCommerceWalletCatalog(null)).toThrow('Commerce wallet catalog is invalid.');
    expect(() => normalizeCommerceWalletSnapshot([])).toThrow('Commerce wallet snapshot is invalid.');
  });

  it('rejects a malformed top-level payload', () => {
    expect(() => normalizeCommerceAccountSnapshot(null)).toThrow('Commerce account snapshot is invalid.');
    expect(() => normalizeCommerceAccountSnapshot([])).toThrow('Commerce account snapshot is invalid.');
  });
});
