export const COMMERCE_MAX_MINOR_AMOUNT = Number.MAX_SAFE_INTEGER;
export const COMMERCE_MAX_TERMS_VERSION_LENGTH = 80;
export const COMMERCE_LISTING_TYPES = ['mua_ban', 'cho_thue', 'can_mua', 'can_thue'] as const;
export type CommerceDocumentType = 'internal_receipt' | 'tax_invoice';

export type CommercePricingPolicy = {
  amountMinor: number | string;
  taxRateBasisPoints?: number | null;
  termsVersion: string;
  validFrom?: string | null;
  validUntil?: string | null;
  documentType: CommerceDocumentType;
  taxInvoiceProvider?: string | null;
  taxInvoiceLifecycle?: string | null;
};

export type CommerceFeeRuleScope = {
  listingType: string;
  propertyTypeId?: string | null;
  priority: number;
  isActive: boolean;
};

export function isValidCommerceCode(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(value.trim());
}

export function isSafeCommerceMinorAmount(value: number | string, allowZero = false): boolean {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return false;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(amount) && amount <= COMMERCE_MAX_MINOR_AMOUNT && (allowZero ? amount >= 0 : amount > 0);
}

export function validateCommerceTermsVersion(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return 'terms_version_required';
  if (normalized.length > COMMERCE_MAX_TERMS_VERSION_LENGTH) return 'terms_version_too_long';
  return null;
}

export function validateCommerceValidityWindow(validFrom?: string | null, validUntil?: string | null): string[] {
  const errors: string[] = [];
  const from = validFrom ? Date.parse(validFrom) : null;
  const until = validUntil ? Date.parse(validUntil) : null;
  if (validFrom && !Number.isFinite(from)) errors.push('valid_from_invalid');
  if (validUntil && !Number.isFinite(until)) errors.push('valid_until_invalid');
  if (from !== null && until !== null && Number.isFinite(from) && Number.isFinite(until) && until <= from) {
    errors.push('validity_window_invalid');
  }
  return errors;
}

export function validateCommercePricingPolicy(policy: CommercePricingPolicy): string[] {
  const errors: string[] = [];
  if (!isSafeCommerceMinorAmount(policy.amountMinor)) errors.push('amount_invalid');
  if (policy.documentType !== 'internal_receipt' && policy.documentType !== 'tax_invoice') errors.push('document_type_invalid');
  if (
    policy.taxRateBasisPoints != null
    && (!Number.isInteger(policy.taxRateBasisPoints) || policy.taxRateBasisPoints < 0 || policy.taxRateBasisPoints > 10_000)
  ) {
    errors.push('tax_rate_invalid');
  }
  const termsError = validateCommerceTermsVersion(policy.termsVersion);
  if (termsError) errors.push(termsError);
  errors.push(...validateCommerceValidityWindow(policy.validFrom, policy.validUntil));
  if (policy.documentType === 'tax_invoice') {
    if (!policy.taxInvoiceProvider?.trim()) errors.push('tax_invoice_provider_required');
    if (!policy.taxInvoiceLifecycle?.trim()) errors.push('tax_invoice_lifecycle_required');
  } else if (policy.taxInvoiceProvider?.trim() || policy.taxInvoiceLifecycle?.trim()) {
    errors.push('tax_invoice_metadata_not_allowed');
  }
  return errors;
}

export function validateCommerceFeeRuleScopes(rules: CommerceFeeRuleScope[]): string[] {
  const errors: string[] = [];
  const activeScopes = new Set<string>();
  for (const rule of rules) {
    if (!(COMMERCE_LISTING_TYPES as readonly string[]).includes(rule.listingType)) {
      errors.push('listing_type_invalid');
    }
    if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1_000_000) {
      errors.push('priority_invalid');
    }
    if (rule.isActive) {
      const scope = `${rule.listingType}:${rule.propertyTypeId ?? '*'}:${rule.priority}`;
      if (activeScopes.has(scope)) errors.push(`active_scope_duplicate:${scope}`);
      activeScopes.add(scope);
    }
  }
  return errors;
}


export const ORDER_STATUSES = [
  'draft', 'awaiting_payment', 'paid', 'payment_failed', 'cancelled',
  'partially_refunded', 'refunded', 'chargeback',
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const PAYMENT_STATUSES = [
  'created', 'pending', 'succeeded', 'failed', 'cancelled',
  'partially_refunded', 'refunded', 'chargeback',
] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const SUBSCRIPTION_GRACE_DAYS = 3;
export const SUBSCRIPTION_PERIOD_STATUSES = [
  'pending', 'paid', 'active', 'grace', 'failed', 'expired', 'cancelled',
] as const;
export type SubscriptionPeriodStatus = typeof SUBSCRIPTION_PERIOD_STATUSES[number];

export const SUBSCRIPTION_STATUSES = [
  'pending', 'active', 'past_due', 'paused', 'cancelled', 'expired',
] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

export const QUOTA_RESERVATION_STATUSES = [
  'reserved', 'consumed', 'released', 'expired',
] as const;
export type QuotaReservationStatus = typeof QUOTA_RESERVATION_STATUSES[number];
export type ListingReviewStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type BillingMode = 'one_time' | 'subscription';

export const ENTITLEMENT_STATUSES = [
  'awaiting_listing_approval', 'active', 'suspended', 'expired', 'revoked', 'refunded',
] as const;
export type EntitlementStatus = typeof ENTITLEMENT_STATUSES[number];

export type PaidBenefitKind = 'listing_quota' | 'listing_duration' | 'sponsored_placement' | 'seller_analytics';
export type PaidBenefit = {
  kind: PaidBenefitKind;
  quantity: number;
  durationDays?: number;
  placementCode?: string;
  sponsoredLabel?: string;
};

export type PackageVersionContract = {
  packageCode: string;
  version: number;
  currency: 'VND';
  billingMode: BillingMode;
  billingPeriodDays?: number;
  unitAmountMinor: number;
  termsVersion: string;
  benefits: PaidBenefit[];
};

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'payment_failed', 'cancelled'],
  payment_failed: ['awaiting_payment', 'cancelled'],
  paid: ['partially_refunded', 'refunded', 'chargeback'],
  partially_refunded: ['refunded', 'chargeback'],
  refunded: [],
  chargeback: [],
  cancelled: [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ['pending', 'succeeded', 'failed', 'cancelled'],
  pending: ['succeeded', 'failed', 'cancelled'],
  failed: ['pending', 'cancelled'],
  succeeded: ['partially_refunded', 'refunded', 'chargeback'],
  partially_refunded: ['refunded', 'chargeback'],
  refunded: [],
  chargeback: [],
  cancelled: [],
};

const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  pending: ['active', 'cancelled'],
  active: ['past_due', 'paused', 'cancelled', 'expired'],
  past_due: ['active', 'paused', 'cancelled', 'expired'],
  paused: ['active', 'cancelled', 'expired'],
  cancelled: [],
  expired: [],
};

const SUBSCRIPTION_PERIOD_TRANSITIONS: Record<SubscriptionPeriodStatus, readonly SubscriptionPeriodStatus[]> = {
  pending: ['paid', 'failed', 'cancelled'],
  paid: ['active', 'failed', 'cancelled'],
  active: ['grace', 'expired', 'cancelled'],
  grace: ['active', 'failed', 'expired', 'cancelled'],
  failed: ['pending', 'paid', 'cancelled'],
  expired: [],
  cancelled: [],
};

const ENTITLEMENT_TRANSITIONS: Record<EntitlementStatus, readonly EntitlementStatus[]> = {
  awaiting_listing_approval: ['active', 'revoked', 'refunded'],
  active: ['suspended', 'expired', 'revoked', 'refunded'],
  suspended: ['active', 'expired', 'revoked', 'refunded'],
  expired: [],
  revoked: [],
  refunded: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionSubscription(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return SUBSCRIPTION_TRANSITIONS[from].includes(to);
}

export function canTransitionSubscriptionPeriod(from: SubscriptionPeriodStatus, to: SubscriptionPeriodStatus): boolean {
  return SUBSCRIPTION_PERIOD_TRANSITIONS[from].includes(to);
}

export function subscriptionGraceUntil(periodEndMs: number): number {
  if (!Number.isFinite(periodEndMs)) throw new RangeError('period_end_invalid');
  return periodEndMs + SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export function quotaReservationStatusAfterListingReview(status: ListingReviewStatus): QuotaReservationStatus {
  if (status === 'pending') return 'reserved';
  if (status === 'approved') return 'consumed';
  if (status === 'rejected') return 'released';
  return 'expired';
}

export function canTransitionEntitlement(from: EntitlementStatus, to: EntitlementStatus): boolean {
  return ENTITLEMENT_TRANSITIONS[from].includes(to);
}

export function entitlementStatusAfterPayment(input: {
  paymentStatus: PaymentStatus;
  benefitKind: PaidBenefitKind;
  listingStatus: 'pending' | 'approved' | 'rejected' | 'expired';
  propertyId: string | null;
  propertyIsActive: boolean;
}): EntitlementStatus | null {
  if (input.paymentStatus === 'refunded') return 'refunded';
  if (input.paymentStatus === 'chargeback') return 'revoked';
  if (input.paymentStatus !== 'succeeded' && input.paymentStatus !== 'partially_refunded') return null;
  if (input.benefitKind === 'listing_quota' || input.benefitKind === 'seller_analytics') return 'active';
  if (input.listingStatus === 'approved') {
    return input.propertyId !== null && input.propertyIsActive ? 'active' : 'revoked';
  }
  if (input.listingStatus === 'pending') return 'awaiting_listing_approval';
  return 'revoked';
}

export function validatePackageVersion(contract: PackageVersionContract): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(contract.packageCode)) errors.push('package_code_invalid');
  if (!Number.isInteger(contract.version) || contract.version < 1) errors.push('version_invalid');
  if (!Number.isSafeInteger(contract.unitAmountMinor) || contract.unitAmountMinor < 0) errors.push('amount_invalid');
  if (contract.billingMode === 'subscription') {
    const periodDays = contract.billingPeriodDays;
    if (!Number.isInteger(periodDays) || (periodDays ?? 0) < 1) errors.push('billing_period_required');
  } else if (contract.billingPeriodDays != null) {
    errors.push('billing_period_not_allowed');
  }
  if (!contract.termsVersion.trim()) errors.push('terms_version_required');
  if (contract.benefits.length === 0) errors.push('benefits_required');

  const kinds = new Set<PaidBenefitKind>();
  for (const benefit of contract.benefits) {
    if (kinds.has(benefit.kind)) errors.push(`benefit_duplicate:${benefit.kind}`);
    kinds.add(benefit.kind);
    if (!Number.isInteger(benefit.quantity) || benefit.quantity < 1 || benefit.quantity > 2_147_483_647) {
      errors.push(`benefit_quantity_invalid:${benefit.kind}`);
    }
    if (
      (benefit.kind === 'listing_duration' || benefit.kind === 'sponsored_placement')
      && benefit.quantity !== 1
    ) {
      errors.push(`benefit_quantity_invalid:${benefit.kind}`);
    }
    if (
      benefit.durationDays != null
      && (!Number.isInteger(benefit.durationDays) || benefit.durationDays < 1 || benefit.durationDays > 2_147_483_647)
    ) {
      errors.push(`benefit_duration_invalid:${benefit.kind}`);
    }
    if (benefit.kind === 'listing_duration' && benefit.durationDays == null) {
      errors.push('listing_duration_required');
    }
    if (benefit.kind === 'sponsored_placement') {
      if (!benefit.placementCode?.trim()) errors.push('sponsored_placement_code_required');
      if (!benefit.sponsoredLabel?.trim()) errors.push('sponsored_label_required');
      if (!benefit.durationDays) errors.push('sponsored_duration_required');
    }
  }
  return errors;
}
