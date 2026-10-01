import { createHash } from 'node:crypto';
import { PayOS, type PaymentLink, type Webhook, type WebhookData } from '@payos/node';
import {
  PAYOS_CAPABILITIES,
  type CheckoutSession,
  type CommercePaymentProvider,
  type CreateCheckoutInput,
  type ProviderPayment,
  type RawWebhookInput,
  type VerifiedPaymentEvent,
} from '../commerceProvider';

type PayOSClient = {
  paymentRequests: {
    create(input: {
      orderCode: number;
      amount: number;
      description: string;
      cancelUrl: string;
      returnUrl: string;
      expiredAt?: number;
    }, options?: { maxRetries?: number; timeout?: number }): Promise<{
      paymentLinkId: string;
      checkoutUrl: string;
      expiredAt?: number;
      amount: number;
      currency: string;
      orderCode: number;
    }>;
    get(paymentLinkIdOrOrderCode: string | number, options?: { maxRetries?: number; timeout?: number }): Promise<PaymentLink>;
  };
  webhooks: {
    verify(webhook: Webhook): Promise<WebhookData>;
  };
};

const statusMap: Record<PaymentLink['status'], ProviderPayment['status']> = {
  PENDING: 'pending',
  PROCESSING: 'pending',
  UNDERPAID: 'pending',
  PAID: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

function parseOrderCode(orderNumber: string): number {
  if (!/^\d+$/.test(orderNumber)) throw new Error('payos_order_code_invalid');
  const orderCode = Number(orderNumber);
  if (!Number.isSafeInteger(orderCode) || orderCode < 1) throw new Error('payos_order_code_invalid');
  return orderCode;
}

function parseExpiredAt(value: string): number {
  const milliseconds = Date.parse(value);
  const seconds = Math.floor(milliseconds / 1000);
  if (!Number.isFinite(milliseconds) || seconds <= Math.floor(Date.now() / 1000) || seconds > 2_147_483_647) {
    throw new Error('payos_expiry_invalid');
  }
  return seconds;
}

function parseWebhookBody(rawBody: string): Webhook {
  const parsed: unknown = JSON.parse(rawBody);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('payos_webhook_invalid');
  return parsed as Webhook;
}

function hashVerifiedWebhookData(data: WebhookData): string {
  const canonical = JSON.stringify({
    orderCode: data.orderCode,
    amount: data.amount,
    description: data.description,
    accountNumber: data.accountNumber,
    reference: data.reference,
    transactionDateTime: data.transactionDateTime,
    currency: data.currency,
    paymentLinkId: data.paymentLinkId,
    code: data.code,
    desc: data.desc,
    counterAccountBankId: data.counterAccountBankId ?? null,
    counterAccountBankName: data.counterAccountBankName ?? null,
    counterAccountName: data.counterAccountName ?? null,
    counterAccountNumber: data.counterAccountNumber ?? null,
    virtualAccountName: data.virtualAccountName ?? null,
    virtualAccountNumber: data.virtualAccountNumber ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export class PayOSCheckoutRecoveryRequired extends Error {
  constructor(
    readonly providerPaymentId: string,
    readonly providerStatus: ProviderPayment['status'],
    readonly orderCode: number,
    readonly amountMinor: number,
    options?: ErrorOptions,
  ) {
    super('payos_checkout_recovery_required', options);
    this.name = 'PayOSCheckoutRecoveryRequired';
  }
}

export class PayOSProvider implements CommercePaymentProvider {
  readonly name = 'payos' as const;
  readonly capabilities = PAYOS_CAPABILITIES;

  constructor(private readonly client: PayOSClient) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (input.currency !== 'VND') throw new Error('payos_currency_unsupported');
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) throw new Error('payos_amount_invalid');
    const description = input.description.trim();
    if (description.length < 1 || description.length > 9) throw new Error('payos_description_invalid');

    const orderCode = parseOrderCode(input.orderNumber);
    const expiredAt = parseExpiredAt(input.expiresAt);
    let response: Awaited<ReturnType<PayOSClient['paymentRequests']['create']>>;
    try {
      response = await this.client.paymentRequests.create({
        orderCode,
        amount: input.amountMinor,
        description,
        cancelUrl: input.cancelUrl,
        returnUrl: input.returnUrl,
        expiredAt,
      }, { maxRetries: 0, timeout: 10_000 });
    } catch (error) {
      try {
        const existing = await this.client.paymentRequests.get(orderCode, { maxRetries: 0, timeout: 10_000 });
        if (existing.orderCode !== orderCode || existing.amount !== input.amountMinor) {
          throw new Error('payos_checkout_recovery_mismatch', { cause: error });
        }
        throw new PayOSCheckoutRecoveryRequired(
          existing.id,
          statusMap[existing.status],
          existing.orderCode,
          existing.amount,
          { cause: error },
        );
      } catch (recoveryError) {
        if (recoveryError instanceof PayOSCheckoutRecoveryRequired) throw recoveryError;
        if (recoveryError instanceof Error && recoveryError.message === 'payos_checkout_recovery_mismatch') throw recoveryError;
        throw error;
      }
    }

    if (
      response.orderCode !== orderCode
      || response.amount !== input.amountMinor
      || response.currency !== input.currency
      || (response.expiredAt != null && response.expiredAt !== expiredAt)
    ) {
      throw new Error('payos_checkout_response_mismatch');
    }

    return {
      provider: 'payos',
      providerPaymentId: response.paymentLinkId,
      checkoutUrl: response.checkoutUrl,
      expiresAt: new Date(expiredAt * 1000).toISOString(),
    };
  }

  async verifyWebhook(input: RawWebhookInput): Promise<VerifiedPaymentEvent> {
    const webhook = parseWebhookBody(input.rawBody);
    const verified = await this.client.webhooks.verify(webhook);
    const signedDataHash = hashVerifiedWebhookData(verified);
    const providerPaymentId = verified.paymentLinkId?.trim() || null;
    if (!providerPaymentId) throw new Error('payos_webhook_identity_missing');
    const providerEventId = verified.reference?.trim() || `payos:${providerPaymentId}:${signedDataHash}`;

    const succeeded = verified.code === '00';
    return {
      provider: 'payos',
      providerEventId,
      providerPaymentId,
      eventType: succeeded ? 'payment.succeeded' : 'payment.failed',
      amountMinor: Number.isSafeInteger(verified.amount) && verified.amount >= 0 ? verified.amount : null,
      currency: verified.currency === 'VND' ? 'VND' : null,
      occurredAt: verified.transactionDateTime || null,
      payloadHash: createHash('sha256').update(input.rawBody).digest('hex'),
      signedDataHash: hashVerifiedWebhookData(verified),
      payload: {
        source: 'payos_webhook',
        orderCode: verified.orderCode,
        providerEventId,
        providerPaymentId,
        statusCode: verified.code,
        amountMinor: Number.isSafeInteger(verified.amount) && verified.amount >= 0 ? verified.amount : null,
        currency: verified.currency === 'VND' ? 'VND' : null,
        occurredAt: verified.transactionDateTime || null,
      },
    };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    if (!providerPaymentId.trim()) throw new Error('payos_payment_id_required');
    const payment = await this.client.paymentRequests.get(providerPaymentId, { maxRetries: 0, timeout: 10_000 });
    const latestTransaction = payment.transactions.at(-1);
    return {
      provider: 'payos',
      providerPaymentId: payment.id,
      status: statusMap[payment.status],
      amountMinor: payment.amount,
      currency: 'VND',
      paidAt: payment.status === 'PAID' ? latestTransaction?.transactionDateTime ?? null : null,
    };
  }
}

export function createPayOSProviderFromEnv(): PayOSProvider {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  if (!clientId || !apiKey || !checksumKey) throw new Error('payos_credentials_missing');
  return new PayOSProvider(new PayOS({ clientId, apiKey, checksumKey }));
}
