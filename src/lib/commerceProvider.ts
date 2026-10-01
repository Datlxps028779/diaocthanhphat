export type CommerceProviderCapabilities = {
  hostedCheckout: boolean;
  signedWebhook: boolean;
  paymentStatusLookup: boolean;
  invoiceLookup: boolean;
  dedicatedSandbox: boolean;
  documentedRefundApi: boolean;
  documentedAutomaticRecurring: boolean;
};

export type CommerceProviderName = 'payos';

export const PAYOS_CAPABILITIES: CommerceProviderCapabilities = {
  hostedCheckout: true,
  signedWebhook: true,
  paymentStatusLookup: true,
  invoiceLookup: true,
  dedicatedSandbox: false,
  documentedRefundApi: false,
  documentedAutomaticRecurring: false,
};

export type CommerceCurrency = 'VND';
export type JsonObject = Record<string, unknown>;

export type CreateCheckoutInput = {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: CommerceCurrency;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiresAt: string;
  idempotencyKey: string;
};

export type CheckoutSession = {
  provider: CommerceProviderName;
  providerPaymentId: string;
  checkoutUrl: string;
  expiresAt: string | null;
};

export type RawWebhookInput = {
  rawBody: string;
  headers: Record<string, string | undefined>;
};

export type VerifiedPaymentEvent = {
  provider: CommerceProviderName;
  providerEventId: string;
  providerPaymentId: string | null;
  eventType: string;
  amountMinor: number | null;
  currency: CommerceCurrency | null;
  occurredAt: string | null;
  payloadHash: string;
  signedDataHash: string;
  payload: JsonObject;
};

export type ProviderPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
export type ProviderPayment = {
  provider: CommerceProviderName;
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountMinor: number;
  currency: CommerceCurrency;
  paidAt: string | null;
};

export type CreateRefundInput = {
  providerPaymentId: string;
  amountMinor: number;
  currency: CommerceCurrency;
  idempotencyKey: string;
  reasonCode: string;
};

export type ProviderRefundResult = {
  provider: CommerceProviderName;
  providerRefundId: string;
  status: 'processing' | 'succeeded' | 'failed';
};

export type CommercePaymentProvider = {
  name: CommerceProviderName;
  capabilities: CommerceProviderCapabilities;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyWebhook(input: RawWebhookInput): Promise<VerifiedPaymentEvent>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  createRefund?(input: CreateRefundInput): Promise<ProviderRefundResult>;
};
