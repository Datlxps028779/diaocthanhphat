import { describe, expect, it } from 'vitest';
import {
  canTransitionEntitlement,
  canTransitionOrder,
  canTransitionPayment,
  canTransitionSubscription,
  canTransitionSubscriptionPeriod,
  entitlementStatusAfterPayment,
  quotaReservationStatusAfterListingReview,
  subscriptionGraceUntil,
  validateCommerceFeeRuleScopes,
  validateCommercePricingPolicy,
  validateCommerceValidityWindow,
  validateCommerceTermsVersion,
  validatePackageVersion,
  type CommerceFeeRuleScope,
  type CommercePricingPolicy,
  type PackageVersionContract,
} from './commerceContract';

const validPackage: PackageVersionContract = {
  packageCode: 'seller_pro',
  version: 1,
  currency: 'VND',
  billingMode: 'one_time',
  unitAmountMinor: 0,
  termsVersion: 'draft-2026-09',
  benefits: [
    { kind: 'listing_quota', quantity: 1 },
    { kind: 'seller_analytics', quantity: 1, durationDays: 30 },
  ],
};

describe('commerce contract', () => {
  it('allows only explicit order transitions', () => {
    expect(canTransitionOrder('draft', 'awaiting_payment')).toBe(true);
    expect(canTransitionOrder('awaiting_payment', 'paid')).toBe(true);
    expect(canTransitionOrder('payment_failed', 'awaiting_payment')).toBe(true);
    expect(canTransitionOrder('paid', 'refunded')).toBe(true);
    expect(canTransitionOrder('refunded', 'paid')).toBe(false);
    expect(canTransitionOrder('draft', 'paid')).toBe(false);
  });

  it('allows retries before success but not after terminal payment states', () => {
    expect(canTransitionPayment('created', 'pending')).toBe(true);
    expect(canTransitionPayment('failed', 'pending')).toBe(true);
    expect(canTransitionPayment('succeeded', 'partially_refunded')).toBe(true);
    expect(canTransitionPayment('chargeback', 'succeeded')).toBe(false);
    expect(canTransitionPayment('refunded', 'pending')).toBe(false);
  });

  it('allows subscription recovery but closes terminal states', () => {
    expect(canTransitionSubscription('pending', 'active')).toBe(true);
    expect(canTransitionSubscription('active', 'past_due')).toBe(true);
    expect(canTransitionSubscription('past_due', 'active')).toBe(true);
    expect(canTransitionSubscription('cancelled', 'active')).toBe(false);
    expect(canTransitionSubscription('expired', 'active')).toBe(false);
  });

  it('tracks renewal periods through paid, active and grace states', () => {
    expect(canTransitionSubscriptionPeriod('pending', 'paid')).toBe(true);
    expect(canTransitionSubscriptionPeriod('paid', 'active')).toBe(true);
    expect(canTransitionSubscriptionPeriod('active', 'grace')).toBe(true);
    expect(canTransitionSubscriptionPeriod('grace', 'active')).toBe(true);
    expect(canTransitionSubscriptionPeriod('expired', 'active')).toBe(false);
  });

  it('uses the approved three-day renewal grace period', () => {
    const periodEnd = Date.UTC(2026, 8, 25);
    expect(subscriptionGraceUntil(periodEnd)).toBe(Date.UTC(2026, 8, 28));
    expect(() => subscriptionGraceUntil(Number.NaN)).toThrow('period_end_invalid');
  });

  it('reserves quota at submit and consumes or releases it at review', () => {
    expect(quotaReservationStatusAfterListingReview('pending')).toBe('reserved');
    expect(quotaReservationStatusAfterListingReview('approved')).toBe('consumed');
    expect(quotaReservationStatusAfterListingReview('rejected')).toBe('released');
    expect(quotaReservationStatusAfterListingReview('expired')).toBe('expired');
  });

  it('keeps entitlement terminal states closed', () => {
    expect(canTransitionEntitlement('awaiting_listing_approval', 'active')).toBe(true);
    expect(canTransitionEntitlement('active', 'suspended')).toBe(true);
    expect(canTransitionEntitlement('suspended', 'active')).toBe(true);
    expect(canTransitionEntitlement('expired', 'active')).toBe(false);
    expect(canTransitionEntitlement('refunded', 'active')).toBe(false);
  });

  it('never activates entitlement before both payment and listing approval', () => {
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'pending', listingStatus: 'approved', propertyId: 'property-1', propertyIsActive: true })).toBeNull();
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'succeeded', listingStatus: 'pending', propertyId: null, propertyIsActive: false })).toBe('awaiting_listing_approval');
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'succeeded', listingStatus: 'approved', propertyId: 'property-1', propertyIsActive: true })).toBe('active');
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'succeeded', listingStatus: 'approved', propertyId: null, propertyIsActive: false })).toBe('revoked');
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'succeeded', listingStatus: 'rejected', propertyId: null, propertyIsActive: false })).toBe('revoked');
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'refunded', listingStatus: 'approved', propertyId: 'property-1', propertyIsActive: true })).toBe('refunded');
    expect(entitlementStatusAfterPayment({ benefitKind: 'sponsored_placement', paymentStatus: 'chargeback', listingStatus: 'approved', propertyId: 'property-1', propertyIsActive: true })).toBe('revoked');
  });

  it('activates account-scoped benefits after payment without a listing dependency', () => {
    expect(entitlementStatusAfterPayment({
      benefitKind: 'listing_quota',
      paymentStatus: 'succeeded',
      listingStatus: 'pending',
      propertyId: null,
      propertyIsActive: false,
    })).toBe('active');
    expect(entitlementStatusAfterPayment({
      benefitKind: 'seller_analytics',
      paymentStatus: 'succeeded',
      listingStatus: 'pending',
      propertyId: null,
      propertyIsActive: false,
    })).toBe('active');
  });

  it('accepts a versioned package without requiring production pricing yet', () => {
    expect(validatePackageVersion(validPackage)).toEqual([]);
  });

  it('requires a billing period for subscriptions and rejects it for one-time packages', () => {
    expect(validatePackageVersion({
      ...validPackage,
      billingMode: 'subscription',
    })).toContain('billing_period_required');
    expect(validatePackageVersion({
      ...validPackage,
      billingPeriodDays: 30,
    })).toContain('billing_period_not_allowed');
    expect(validatePackageVersion({
      ...validPackage,
      billingMode: 'subscription',
      billingPeriodDays: 30,
    })).toEqual([]);
  });

  it('requires sponsored placement to be labeled, located and time-bounded', () => {
    const errors = validatePackageVersion({
      ...validPackage,
      benefits: [{ kind: 'sponsored_placement', quantity: 1 }],
    });
    expect(errors).toContain('sponsored_placement_code_required');
    expect(errors).toContain('sponsored_label_required');
    expect(errors).toContain('sponsored_duration_required');
  });

  it('requires listing duration and keeps benefit integers within PostgreSQL range', () => {
    const errors = validatePackageVersion({
      ...validPackage,
      benefits: [
        { kind: 'listing_duration', quantity: 1 },
        { kind: 'listing_quota', quantity: 2_147_483_648 },
        { kind: 'seller_analytics', quantity: 1, durationDays: 2_147_483_648 },
        {
          kind: 'sponsored_placement',
          quantity: 2,
          durationDays: 30,
          placementCode: 'listing_top',
          sponsoredLabel: 'Tài trợ',
        },
      ],
    });
    expect(errors).toContain('listing_duration_required');
    expect(errors).toContain('benefit_quantity_invalid:listing_quota');
    expect(errors).toContain('benefit_duration_invalid:seller_analytics');
    expect(errors).toContain('benefit_quantity_invalid:sponsored_placement');
  });

  it('validates pricing policy shape without choosing business values', () => {
    const validPolicy: CommercePricingPolicy = {
      amountMinor: '1000',
      taxRateBasisPoints: null,
      termsVersion: 'approved-terms',
      validFrom: '2026-10-01T00:00:00.000Z',
      validUntil: '2026-11-01T00:00:00.000Z',
      documentType: 'internal_receipt',
    };
    expect(validateCommercePricingPolicy(validPolicy)).toEqual([]);
    expect(validateCommercePricingPolicy({
      ...validPolicy,
      amountMinor: '9007199254740992',
      termsVersion: '',
      validFrom: '2026-11-01T00:00:00.000Z',
      validUntil: '2026-10-01T00:00:00.000Z',
    })).toEqual(expect.arrayContaining(['amount_invalid', 'terms_version_required', 'validity_window_invalid']));
    expect(validateCommercePricingPolicy({
      ...validPolicy,
      documentType: 'tax_invoice',
    })).toEqual(expect.arrayContaining(['tax_invoice_provider_required', 'tax_invoice_lifecycle_required']));
    expect(validateCommercePricingPolicy({
      ...validPolicy,
      taxInvoiceProvider: 'not-allowed',
      taxInvoiceLifecycle: 'not-allowed',
    })).toContain('tax_invoice_metadata_not_allowed');
  });

  it('keeps terms and validity boundaries aligned with database constraints', () => {
    expect(validateCommerceTermsVersion('x'.repeat(80))).toBeNull();
    expect(validateCommerceTermsVersion('x'.repeat(81))).toBe('terms_version_too_long');
    expect(validateCommerceValidityWindow('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')).toContain('validity_window_invalid');
    expect(validateCommerceValidityWindow('not-a-date', null)).toContain('valid_from_invalid');
  });

  it('rejects duplicate active fee-rule scopes but allows inactive drafts', () => {
    const rules: CommerceFeeRuleScope[] = [
      { listingType: 'mua_ban', propertyTypeId: null, priority: 100, isActive: true },
      { listingType: 'mua_ban', propertyTypeId: null, priority: 100, isActive: true },
      { listingType: 'mua_ban', propertyTypeId: null, priority: 100, isActive: false },
    ];
    expect(validateCommerceFeeRuleScopes(rules)).toContain('active_scope_duplicate:mua_ban:*:100');
    expect(validateCommerceFeeRuleScopes([{ ...rules[0], listingType: 'invalid' }])).toContain('listing_type_invalid');
  });

  it('rejects invalid amounts, duplicate benefits and unversioned terms', () => {
    const errors = validatePackageVersion({
      ...validPackage,
      unitAmountMinor: 1.5,
      termsVersion: '',
      benefits: [
        { kind: 'listing_quota', quantity: 1 },
        { kind: 'listing_quota', quantity: 0 },
      ],
    });
    expect(errors).toContain('amount_invalid');
    expect(errors).toContain('terms_version_required');
    expect(errors).toContain('benefit_duplicate:listing_quota');
    expect(errors).toContain('benefit_quantity_invalid:listing_quota');
  });
});
