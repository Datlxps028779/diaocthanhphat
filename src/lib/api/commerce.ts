import { supabase } from '../supabase';

export type CommerceMinorAmount = number | string;

export type CommerceOrderItem = {
  id: string;
  package_version_id: string;
  quantity: number;
  unit_amount_minor: CommerceMinorAmount;
  total_amount_minor: CommerceMinorAmount;
  benefit_snapshot: unknown[];
};

export type CommerceOrder = {
  id: string;
  order_number: CommerceMinorAmount;
  status: string;
  currency: 'VND';
  subtotal_minor: CommerceMinorAmount;
  tax_minor: CommerceMinorAmount;
  total_minor: CommerceMinorAmount;
  terms_version: string;
  package_snapshot: Record<string, unknown>;
  items: CommerceOrderItem[];
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercePayment = {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount_minor: CommerceMinorAmount;
  currency: 'VND';
  checkout_url: string | null;
  expires_at: string | null;
  succeeded_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommerceEntitlement = {
  id: string;
  order_item_id: string;
  package_version_id: string;
  subscription_period_id: string | null;
  user_listing_id: string | null;
  property_id: string | null;
  benefit_kind: string;
  status: string;
  quantity_total: number;
  quantity_remaining: number;
  duration_days: number | null;
  placement_code: string | null;
  sponsored_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  is_effective: boolean;
};

export type CommerceQuotaMovement = {
  id: string;
  entitlement_id: string;
  user_listing_id: string | null;
  order_id: string | null;
  operation: string;
  delta: number;
  balance_after: number;
  occurred_at: string;
};

export type CommerceNotification = {
  id: string;
  kind: 'payment_succeeded' | 'payment_failed';
  title: string;
  body: string;
  action_path: string | null;
  read_at: string | null;
  created_at: string;
};

export type CommerceAccountSnapshot = {
  orders: CommerceOrder[];
  payments: CommercePayment[];
  entitlements: CommerceEntitlement[];
  quotaLedger: CommerceQuotaMovement[];
  subscriptions: Array<Record<string, unknown>>;
  subscriptionPeriods: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  refunds: Array<Record<string, unknown>>;
  notifications: CommerceNotification[];
  unreadNotifications: number;
  generatedAt: string;
};

export type CommerceOperationsAlert = {
  id: string;
  outbox_id: string;
  payment_attempt_id: string | null;
  severity: 'warning' | 'critical';
  code: 'payment_failure_ignored' | 'duplicate_settlement' | 'email_delivery_dead_letter';
  status: 'open' | 'acknowledged' | 'resolved';
  alert_payload: Record<string, unknown>;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommerceEmailDeliveryStatus = {
  id: string;
  notification_id: string;
  template_kind: CommerceNotification['kind'];
  status: 'pending' | 'processing' | 'retry' | 'sent' | 'dead_letter';
  attempts: number;
  last_error_code: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommerceOperationsAlertDetail = {
  alert: Omit<CommerceOperationsAlert, 'alert_payload'>;
  paymentAttempt: CommercePayment | null;
  order: (CommerceOrder & { owner_user_id: string }) | null;
  paymentEvents: Array<Record<string, unknown>>;
  entitlements: CommerceEntitlement[];
  quotaReservations: Array<Record<string, unknown>>;
  listings: Array<{ id: string; user_id: string; property_id: string | null; status: string }>;
  properties: Array<{ id: string; is_active: boolean }>;
  notifications: CommerceNotification[];
  emailDeliveries: CommerceEmailDeliveryStatus[];
  auditTimeline: Array<Record<string, unknown>>;
  generatedAt: string;
};

const rows = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function normalizeCommerceAccountSnapshot(value: unknown): CommerceAccountSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commerce account snapshot is invalid.');
  }
  const snapshot = value as Record<string, unknown>;
  return {
    orders: rows<CommerceOrder>(snapshot.orders).map(order => ({
      ...order,
      items: Array.isArray(order.items) ? order.items : [],
    })),
    payments: rows<CommercePayment>(snapshot.payments),
    entitlements: rows<CommerceEntitlement>(snapshot.entitlements),
    quotaLedger: rows<CommerceQuotaMovement>(snapshot.quotaLedger),
    subscriptions: rows<Record<string, unknown>>(snapshot.subscriptions),
    subscriptionPeriods: rows<Record<string, unknown>>(snapshot.subscriptionPeriods),
    invoices: rows<Record<string, unknown>>(snapshot.invoices),
    refunds: rows<Record<string, unknown>>(snapshot.refunds),
    notifications: rows<CommerceNotification>(snapshot.notifications),
    unreadNotifications: Number.isInteger(snapshot.unreadNotifications) && Number(snapshot.unreadNotifications) >= 0
      ? Number(snapshot.unreadNotifications)
      : 0,
    generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : new Date(0).toISOString(),
  };
}

export function normalizeCommerceOperationsAlertDetail(value: unknown): CommerceOperationsAlertDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commerce operations detail is invalid.');
  }
  const detail = value as Record<string, unknown>;
  if (!detail.alert || typeof detail.alert !== 'object' || Array.isArray(detail.alert)) {
    throw new Error('Commerce operations alert is invalid.');
  }
  return {
    alert: detail.alert as CommerceOperationsAlertDetail['alert'],
    paymentAttempt: detail.paymentAttempt && typeof detail.paymentAttempt === 'object' && !Array.isArray(detail.paymentAttempt)
      ? detail.paymentAttempt as CommercePayment
      : null,
    order: detail.order && typeof detail.order === 'object' && !Array.isArray(detail.order)
      ? detail.order as CommerceOperationsAlertDetail['order']
      : null,
    paymentEvents: rows<Record<string, unknown>>(detail.paymentEvents),
    entitlements: rows<CommerceEntitlement>(detail.entitlements),
    quotaReservations: rows<Record<string, unknown>>(detail.quotaReservations),
    listings: rows<CommerceOperationsAlertDetail['listings'][number]>(detail.listings),
    properties: rows<CommerceOperationsAlertDetail['properties'][number]>(detail.properties),
    notifications: rows<CommerceNotification>(detail.notifications),
    emailDeliveries: rows<CommerceEmailDeliveryStatus>(detail.emailDeliveries),
    auditTimeline: rows<Record<string, unknown>>(detail.auditTimeline),
    generatedAt: typeof detail.generatedAt === 'string' ? detail.generatedAt : new Date(0).toISOString(),
  };
}

export type CommerceWalletCatalog = {
  config: {
    custom_amount_enabled: boolean;
    custom_min_minor: CommerceMinorAmount | null;
    custom_max_minor: CommerceMinorAmount | null;
    custom_step_minor: CommerceMinorAmount | null;
    currency: 'VND';
  } | null;
  topupOptions: Array<{ code: string; label: string; amount_minor: CommerceMinorAmount; currency: 'VND' }>;
  feeProducts: Array<{
    id: string;
    code: string;
    version: number;
    name: string;
    description: string | null;
    product_kind: 'listing_basic' | 'sponsored_addon';
    amount_minor: CommerceMinorAmount;
    currency: 'VND';
    duration_days: number | null;
    placement_code: string | null;
    sponsored_label: string | null;
    terms_version: string;
  }>;
  generatedAt: string;
};

export type CommerceWalletTopupIntent = {
  id: string;
  source_kind: 'fixed_option' | 'custom_amount';
  option_code: string | null;
  requested_amount_minor: CommerceMinorAmount;
  currency: 'VND';
  status: 'draft' | 'awaiting_payment' | 'credited' | 'failed' | 'cancelled' | 'chargeback_review';
  credited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommerceWalletFeeReservation = {
  id: string;
  user_listing_id: string | null;
  submission_cycle: number;
  total_minor: CommerceMinorAmount;
  currency: 'VND';
  status: 'reserved' | 'captured' | 'released' | 'expired';
  pricing_snapshot: Array<Record<string, unknown>>;
  expires_at: string;
  captured_at: string | null;
  released_at: string | null;
  created_at: string;
};

export type CommerceWalletMovement = {
  id: string;
  operation: 'topup_credit' | 'fee_reserve' | 'fee_capture' | 'fee_release' | 'admin_credit' | 'admin_debit' | 'chargeback_debit';
  amount_minor: CommerceMinorAmount;
  currency: 'VND';
  available_after: CommerceMinorAmount;
  reserved_after: CommerceMinorAmount;
  topup_intent_id: string | null;
  fee_reservation_id: string | null;
  occurred_at: string;
};

export type CommerceWalletReceipt = {
  id: string;
  receipt_number: string;
  receipt_kind: 'wallet_topup' | 'listing_fee';
  document_type: 'internal_receipt';
  status: 'issued' | 'void';
  amount_minor: CommerceMinorAmount;
  currency: 'VND';
  issued_at: string;
  voided_at: string | null;
};

export type CommerceWalletSnapshot = {
  wallet: { currency: 'VND'; available_minor: CommerceMinorAmount; reserved_minor: CommerceMinorAmount; updated_at: string | null };
  topupIntents: CommerceWalletTopupIntent[];
  feeReservations: CommerceWalletFeeReservation[];
  ledger: CommerceWalletMovement[];
  receipts: CommerceWalletReceipt[];
  generatedAt: string;
};

export type CommerceListingApprovalFeeMode = 'free' | 'paid';

export type CommerceListingApprovalInput = {
  feeMode: CommerceListingApprovalFeeMode;
  idempotencyKey: string;
  feeProductCode?: string;
  manualReason?: string;
};

export type CommerceListingApprovalResult = {
  listing_id: string;
  property_id: string;
  fee_mode: CommerceListingApprovalFeeMode;
  fee_product_id: string | null;
  fee_product_code: string | null;
  fee_product_version: number | null;
  amount_minor: CommerceMinorAmount | null;
  currency: 'VND' | null;
  duration_days: number | null;
  terms_version: string | null;
  approval_cycle: number;
  idempotency_key: string;
  receipt_number: string | null;
};
export type CommerceListingApprovalFeeProduct = {
  rule_id: string;
  fee_product_id: string;
  code: string;
  version: number;
  name: string;
  description: string | null;
  amount_minor: CommerceMinorAmount;
  currency: 'VND';
  duration_days: number | null;
  terms_version: string;
  listing_type: string;
  property_type_id: string | null;
  priority: number;
  rule_specificity: 'listing_type' | 'property_type';
};

export type CommerceListingApprovalFeeOptions = {
  listing_id: string;
  owner_user_id: string;
  listing_type: string;
  property_type_id: string | null;
  available_minor: CommerceMinorAmount;
  reserved_minor: CommerceMinorAmount;
  products: CommerceListingApprovalFeeProduct[];
};

export function normalizeCommerceListingApprovalFeeOptions(value: unknown): CommerceListingApprovalFeeOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commerce listing approval fee options are invalid.');
  }
  const row = value as Record<string, unknown>;
  if (typeof row.listing_id !== 'string' || typeof row.owner_user_id !== 'string' || typeof row.listing_type !== 'string') {
    throw new Error('Commerce listing approval fee options identity is invalid.');
  }
  return {
    listing_id: row.listing_id,
    owner_user_id: row.owner_user_id,
    listing_type: row.listing_type,
    property_type_id: typeof row.property_type_id === 'string' ? row.property_type_id : null,
    available_minor: row.available_minor as CommerceMinorAmount,
    reserved_minor: row.reserved_minor as CommerceMinorAmount,
    products: rows<CommerceListingApprovalFeeProduct>(row.products),
  };
}

export async function getListingApprovalFeeOptions(listingId: string): Promise<CommerceListingApprovalFeeOptions> {
  const { data, error } = await supabase.rpc('commerce_get_listing_approval_fee_options', {
    p_listing_id: listingId,
  });
  if (error) throw error;
  return normalizeCommerceListingApprovalFeeOptions(data);
}
export function normalizeCommerceWalletCatalog(value: unknown): CommerceWalletCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Commerce wallet catalog is invalid.');
  const row = value as Record<string, unknown>;
  return {
    config: row.config && typeof row.config === 'object' && !Array.isArray(row.config) ? row.config as CommerceWalletCatalog['config'] : null,
    topupOptions: rows<CommerceWalletCatalog['topupOptions'][number]>(row.topupOptions),
    feeProducts: rows<CommerceWalletCatalog['feeProducts'][number]>(row.feeProducts),
    generatedAt: typeof row.generatedAt === 'string' ? row.generatedAt : new Date(0).toISOString(),
  };
}

export function normalizeCommerceWalletSnapshot(value: unknown): CommerceWalletSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Commerce wallet snapshot is invalid.');
  const row = value as Record<string, unknown>;
  const wallet = row.wallet && typeof row.wallet === 'object' && !Array.isArray(row.wallet)
    ? row.wallet as CommerceWalletSnapshot['wallet']
    : { currency: 'VND' as const, available_minor: 0, reserved_minor: 0, updated_at: null };
  return {
    wallet,
    topupIntents: rows<CommerceWalletTopupIntent>(row.topupIntents),
    feeReservations: rows<CommerceWalletFeeReservation>(row.feeReservations),
    ledger: rows<CommerceWalletMovement>(row.ledger),
    receipts: rows<CommerceWalletReceipt>(row.receipts),
    generatedAt: typeof row.generatedAt === 'string' ? row.generatedAt : new Date(0).toISOString(),
  };
}
export type CommerceWalletSupportDetail = {
  topupIntent: Record<string, unknown>;
  checkout: Record<string, unknown> | null;
  ledger: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
  financeCases: Array<Record<string, unknown>>;
  reconciliation: Array<Record<string, unknown>>;
  auditTimeline: Array<Record<string, unknown>>;
  generatedAt: string;
};


export function normalizeCommerceWalletSupportDetail(value: unknown): CommerceWalletSupportDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Commerce wallet support detail is invalid.');
  const row = value as Record<string, unknown>;
  if (!row.topupIntent || typeof row.topupIntent !== 'object' || Array.isArray(row.topupIntent)) {
    throw new Error('Commerce wallet support top-up is invalid.');
  }
  return {
    topupIntent: row.topupIntent as Record<string, unknown>,
    checkout: row.checkout && typeof row.checkout === 'object' && !Array.isArray(row.checkout) ? row.checkout as Record<string, unknown> : null,
    ledger: rows<Record<string, unknown>>(row.ledger),
    receipts: rows<Record<string, unknown>>(row.receipts),
    financeCases: rows<Record<string, unknown>>(row.financeCases),
    reconciliation: rows<Record<string, unknown>>(row.reconciliation),
    auditTimeline: rows<Record<string, unknown>>(row.auditTimeline),
    generatedAt: typeof row.generatedAt === 'string' ? row.generatedAt : new Date(0).toISOString(),
  };
}

export async function getCommerceWalletSupportDetail(lookup: string): Promise<CommerceWalletSupportDetail> {
  const { data, error } = await supabase.rpc('commerce_get_wallet_support_detail', { p_lookup: lookup });
  if (error) throw error;
  return normalizeCommerceWalletSupportDetail(data);
}

export async function getCommerceWalletCatalog(): Promise<CommerceWalletCatalog> {
  const { data, error } = await supabase.rpc('commerce_get_wallet_catalog');
  if (error) throw error;
  return normalizeCommerceWalletCatalog(data);
}

export async function getMyCommerceWallet(): Promise<CommerceWalletSnapshot> {
  const { data, error } = await supabase.rpc('commerce_get_my_wallet_snapshot');
  if (error) throw error;
  return normalizeCommerceWalletSnapshot(data);
}

export type CommerceWalletAdminConfiguration = {
  config: {
    id: true;
    is_active: boolean;
    custom_amount_enabled: boolean;
    custom_min_minor: CommerceMinorAmount | null;
    custom_max_minor: CommerceMinorAmount | null;
    custom_step_minor: CommerceMinorAmount | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  topupOptions: Array<{
    id: string;
    code: string;
    label: string;
    amount_minor: CommerceMinorAmount;
    currency: 'VND';
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>;
  feeProducts: Array<{
    id: string;
    code: string;
    version: number;
    name: string;
    description: string | null;
    product_kind: 'listing_basic' | 'sponsored_addon';
    amount_minor: CommerceMinorAmount;
    currency: 'VND';
    duration_days: number | null;
    placement_code: string | null;
    sponsored_label: string | null;
    terms_version: string;
    is_active: boolean;
    is_default: boolean;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string;
    updated_at: string;
  }>;
  generatedAt: string;
};

export function normalizeCommerceWalletAdminConfiguration(value: unknown): CommerceWalletAdminConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commerce wallet admin configuration is invalid.');
  }
  const row = value as Record<string, unknown>;
  const config = row.config && typeof row.config === 'object' && !Array.isArray(row.config)
    ? row.config as CommerceWalletAdminConfiguration['config']
    : null;
  return {
    config,
    topupOptions: rows<CommerceWalletAdminConfiguration['topupOptions'][number]>(row.topupOptions),
    feeProducts: rows<CommerceWalletAdminConfiguration['feeProducts'][number]>(row.feeProducts),
    generatedAt: typeof row.generatedAt === 'string' ? row.generatedAt : new Date(0).toISOString(),
  };
}

export async function getCommerceWalletAdminConfiguration(): Promise<CommerceWalletAdminConfiguration> {
  const { data, error } = await supabase.rpc('commerce_admin_get_wallet_configuration');
  if (error) throw error;
  return normalizeCommerceWalletAdminConfiguration(data);
}

export async function updateCommerceWalletTopupConfig(input: {
  isActive: boolean;
  customAmountEnabled: boolean;
  customMinMinor: string | null;
  customMaxMinor: string | null;
  customStepMinor: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('commerce_admin_update_wallet_topup_config', {
    p_is_active: input.isActive,
    p_custom_amount_enabled: input.customAmountEnabled,
    p_custom_min_minor: input.customMinMinor,
    p_custom_max_minor: input.customMaxMinor,
    p_custom_step_minor: input.customStepMinor,
  });
  if (error) throw error;
}

export async function saveCommerceWalletTopupOption(input: {
  id?: string;
  code: string;
  label: string;
  amountMinor: string;
  isActive: boolean;
  sortOrder: number;
}): Promise<void> {
  const { error } = await supabase.rpc('commerce_admin_save_wallet_topup_option', {
    p_id: input.id ?? null,
    p_code: input.code,
    p_label: input.label,
    p_amount_minor: input.amountMinor,
    p_is_active: input.isActive,
    p_sort_order: input.sortOrder,
  });
  if (error) throw error;
}

export async function saveCommerceFeeProduct(input: {
  id?: string;
  code: string;
  version: number;
  name: string;
  description: string | null;
  productKind: 'listing_basic' | 'sponsored_addon';
  amountMinor: string;
  durationDays: number;
  placementCode: string | null;
  sponsoredLabel: string | null;
  termsVersion: string;
  isActive: boolean;
  isDefault: boolean;
  validFrom: string | null;
  validUntil: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('commerce_admin_save_fee_product', {
    p_id: input.id ?? null,
    p_code: input.code,
    p_version: input.version,
    p_name: input.name,
    p_description: input.description,
    p_product_kind: input.productKind,
    p_amount_minor: input.amountMinor,
    p_duration_days: input.durationDays,
    p_placement_code: input.placementCode,
    p_sponsored_label: input.sponsoredLabel,
    p_terms_version: input.termsVersion,
    p_is_active: input.isActive,
    p_is_default: input.isDefault,
    p_valid_from: input.validFrom,
    p_valid_until: input.validUntil,
  });
  if (error) throw error;
}

export type CommerceCatalogPackage = {
  package_id: string;
  package_code: string;
  package_name: string;
  package_description: string | null;
  package_version_id: string;
  version: number;
  currency: 'VND';
  billing_mode: 'one_time' | 'subscription';
  billing_period_days: number | null;
  unit_amount_minor: CommerceMinorAmount;
  tax_rate_basis_points: number;
  terms_version: string;
  benefits: unknown[];
};

export function normalizeCommerceCatalog(value: unknown): CommerceCatalogPackage[] {
  return rows<CommerceCatalogPackage>(value).filter(item => (
    typeof item.package_id === 'string'
    && typeof item.package_code === 'string'
    && typeof item.package_name === 'string'
    && typeof item.package_version_id === 'string'
    && item.currency === 'VND'
    && (item.billing_mode === 'one_time' || item.billing_mode === 'subscription')
    && Array.isArray(item.benefits)
  ));
}

export async function getCommerceCatalog(): Promise<CommerceCatalogPackage[]> {
  const { data, error } = await supabase.rpc('commerce_get_catalog');
  if (error) throw error;
  return normalizeCommerceCatalog(data);
}

export type CommerceCheckoutResponse =
  | { status: 'checkout_ready'; orderId: string; paymentAttemptId: string; providerPaymentId: string; checkoutUrl: string; expiresAt: string }
  | { status: 'checkout_processing'; orderId: string; paymentAttemptId: string }
  | { status: 'pending_reconciliation'; orderId: string; paymentAttemptId: string; providerPaymentId: string; providerStatus: string };

export class CommerceCheckoutApiError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommerceCheckoutApiError';
  }
}

export async function startCommerceCheckout(input: {
  packageVersionId?: string;
  orderId?: string;
  quantity: number;
  idempotencyKey?: string;
}): Promise<CommerceCheckoutResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new CommerceCheckoutApiError('COMMERCE_AUTH_REQUIRED', 401);
  const idempotencyKey = input.idempotencyKey ?? `checkout_${crypto.randomUUID().replaceAll('-', '')}`;
  const response = await fetch('/api/commerce/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      ...(input.packageVersionId ? { package_version_id: input.packageVersionId } : {}),
      ...(input.orderId ? { order_id: input.orderId } : {}),
      quantity: input.quantity,
      idempotency_key: idempotencyKey,
    }),
  });
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
  if (!response.ok) {
    const code = typeof body?.code === 'string' ? body.code : 'COMMERCE_CHECKOUT_FAILED';
    throw new CommerceCheckoutApiError(code, response.status);
  }
  if (!body || typeof body !== 'object' || !('status' in body)) {
    throw new CommerceCheckoutApiError('COMMERCE_CHECKOUT_INVALID_RESPONSE', response.status);
  }
  return body as CommerceCheckoutResponse;
}

export async function getMyCommerceAccount(): Promise<CommerceAccountSnapshot> {
  const { data, error } = await supabase.rpc('commerce_get_my_account_snapshot');
  if (error) throw error;
  return normalizeCommerceAccountSnapshot(data);
}

export async function markCommerceNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('commerce_mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function getCommerceOperationsAlerts(
  status: CommerceOperationsAlert['status'] | null = null,
): Promise<CommerceOperationsAlert[]> {
  const { data, error } = await supabase.rpc('commerce_get_operations_alerts', {
    p_status: status,
    p_limit: 100,
  });
  if (error) throw error;
  return rows<CommerceOperationsAlert>(data);
}

export async function getCommerceOperationsAlertCount(): Promise<number> {
  const { data, error } = await supabase.rpc('commerce_get_operations_alert_count');
  if (error) throw error;
  const count = Number(data);
  if (!Number.isInteger(count) || count < 0) throw new Error('Commerce operations alert count is invalid.');
  return count;
}

export async function getCommerceOperationsAlertDetail(alertId: string): Promise<CommerceOperationsAlertDetail> {
  const [detailResult, emailResult] = await Promise.all([
    supabase.rpc('commerce_get_operations_alert_detail', { p_alert_id: alertId }),
    supabase.rpc('commerce_get_operations_alert_email_deliveries', { p_alert_id: alertId }),
  ]);
  if (detailResult.error) throw detailResult.error;
  if (emailResult.error) throw emailResult.error;
  return {
    ...normalizeCommerceOperationsAlertDetail(detailResult.data),
    emailDeliveries: rows<CommerceEmailDeliveryStatus>(emailResult.data),
  };
}

export async function updateCommerceOperationsAlertStatus(
  alertId: string,
  status: CommerceOperationsAlert['status'],
): Promise<void> {
  const { error } = await supabase.rpc('commerce_update_operations_alert_status', {
    p_alert_id: alertId,
    p_status: status,
  });
  if (error) throw error;
}
