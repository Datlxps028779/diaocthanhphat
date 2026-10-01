import { createHash, randomUUID } from 'node:crypto';
import type { CommercePaymentProvider } from '../commerceProvider';
import { PayOSCheckoutRecoveryRequired } from './payosProvider';

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type OrderRow = {
  order_id: string;
  order_number: string | number;
  total_minor: string | number;
  currency: string;
};

type AttemptRow = {
  payment_attempt_id: string;
  provider_order_code: string | number;
  amount_minor: string | number;
  currency: string;
  attempt_status: string;
  attempt_expires_at: string;
  provider_payment_id: string | null;
  checkout_url: string | null;
};

export type CommerceCheckoutInput = {
  packageVersionId: string | null;
  quantity: number;
  idempotencyKey: string;
  siteUrl: string;
  orderId?: string;
};

export type CommerceCheckoutResult =
  | {
      status: 'checkout_ready';
      orderId: string;
      paymentAttemptId: string;
      providerPaymentId: string;
      checkoutUrl: string;
      expiresAt: string;
    }
  | {
      status: 'checkout_processing';
      orderId: string;
      paymentAttemptId: string;
    }
  | {
      status: 'pending_reconciliation';
      orderId: string;
      paymentAttemptId: string;
      providerPaymentId: string;
      providerStatus: string;
    };

export class CommerceCheckoutError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommerceCheckoutError';
  }
}

function firstRow<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new CommerceCheckoutError('COMMERCE_RPC_INVALID_RESPONSE');
  return row as T;
}

function integer(value: string | number, code: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new CommerceCheckoutError(code);
  return parsed;
}

function checkoutDescription(providerOrderCode: number): string {
  return `CNV${String(providerOrderCode).slice(-6).padStart(6, '0')}`;
}

function paymentIdempotencyKey(orderId: string, clientKey: string): string {
  const digest = createHash('sha256').update(clientKey).digest('hex');
  return `payment:${orderId}:${digest}`;
}

export async function createCommerceCheckout(input: CommerceCheckoutInput, deps: {
  userClient: RpcClient;
  serviceClient: RpcClient;
  provider: CommercePaymentProvider;
}): Promise<CommerceCheckoutResult> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
    throw new CommerceCheckoutError('COMMERCE_QUANTITY_INVALID');
  }
  if (!/^[A-Za-z0-9_-]{16,140}$/.test(input.idempotencyKey)) {
    throw new CommerceCheckoutError('COMMERCE_IDEMPOTENCY_KEY_INVALID');
  }

  if (!input.orderId && !input.packageVersionId) {
    throw new CommerceCheckoutError('COMMERCE_PACKAGE_VERSION_REQUIRED');
  }

  let order: OrderRow;
  if (input.orderId) {
    order = {
      order_id: input.orderId,
      order_number: 0,
      total_minor: 0,
      currency: 'VND',
    };
  } else {
    const orderResult = await deps.userClient.rpc('commerce_create_order', {
      p_package_version_id: input.packageVersionId,
      p_quantity: input.quantity,
      p_idempotency_key: `order:${input.idempotencyKey}`,
    });
    if (orderResult.error) throw new CommerceCheckoutError('COMMERCE_ORDER_CREATE_FAILED', { cause: orderResult.error });
    order = firstRow<OrderRow>(orderResult.data);
  }
  const paymentKey = paymentIdempotencyKey(order.order_id, input.idempotencyKey);

  const attemptResult = await deps.userClient.rpc('commerce_start_payment_attempt', {
    p_order_id: order.order_id,
    p_provider: deps.provider.name,
    p_idempotency_key: paymentKey,
  });
  if (attemptResult.error) throw new CommerceCheckoutError('COMMERCE_PAYMENT_ATTEMPT_FAILED', { cause: attemptResult.error });
  const attempt = firstRow<AttemptRow>(attemptResult.data);
  const amountMinor = integer(attempt.amount_minor, 'COMMERCE_AMOUNT_INVALID');
  const providerOrderCode = integer(attempt.provider_order_code, 'COMMERCE_PROVIDER_ORDER_CODE_INVALID');
  if (attempt.currency !== 'VND') throw new CommerceCheckoutError('COMMERCE_CURRENCY_INVALID');
  const attemptExpiryMs = Date.parse(attempt.attempt_expires_at);
  if (!attempt.attempt_expires_at || !Number.isFinite(attemptExpiryMs)) {
    throw new CommerceCheckoutError('COMMERCE_ATTEMPT_EXPIRY_INVALID');
  }
  if (attempt.provider_payment_id) {
    if (
      attempt.checkout_url
      && attemptExpiryMs > Date.now()
      && (attempt.attempt_status === 'created' || attempt.attempt_status === 'pending')
    ) {
      return {
        status: 'checkout_ready',
        orderId: order.order_id,
        paymentAttemptId: attempt.payment_attempt_id,
        providerPaymentId: attempt.provider_payment_id,
        checkoutUrl: attempt.checkout_url,
        expiresAt: attempt.attempt_expires_at,
      };
    }
    return {
      status: 'pending_reconciliation',
      orderId: order.order_id,
      paymentAttemptId: attempt.payment_attempt_id,
      providerPaymentId: attempt.provider_payment_id,
      providerStatus: attempt.attempt_status,
    };
  }

  if (attempt.attempt_status !== 'created') {
    throw new CommerceCheckoutError('COMMERCE_PAYMENT_ATTEMPT_TERMINAL');
  }

  const claimToken = randomUUID();
  const claimResult = await deps.serviceClient.rpc('commerce_claim_payment_checkout', {
    p_payment_attempt_id: attempt.payment_attempt_id,
    p_claim_token: claimToken,
  });
  if (claimResult.error) throw new CommerceCheckoutError('COMMERCE_CHECKOUT_CLAIM_FAILED', { cause: claimResult.error });
  if (claimResult.data !== true) {
    return {
      status: 'checkout_processing',
      orderId: order.order_id,
      paymentAttemptId: attempt.payment_attempt_id,
    };
  }

  const baseUrl = new URL(input.siteUrl).origin;
  let checkout: Awaited<ReturnType<CommercePaymentProvider['createCheckout']>>;
  try {
    checkout = await deps.provider.createCheckout({
      orderId: order.order_id,
      orderNumber: String(providerOrderCode),
      amountMinor,
      currency: 'VND',
      description: checkoutDescription(providerOrderCode),
      returnUrl: `${baseUrl}/tai-khoan?payment=success`,
      cancelUrl: `${baseUrl}/tai-khoan?payment=cancelled`,
      expiresAt: attempt.attempt_expires_at,
      idempotencyKey: paymentKey,
    });
  } catch (error) {
    if (error instanceof PayOSCheckoutRecoveryRequired) {
      const attachResult = await deps.serviceClient.rpc('commerce_attach_payment_checkout', {
        p_payment_attempt_id: attempt.payment_attempt_id,
        p_provider_payment_id: error.providerPaymentId,
        p_checkout_url: null,
        p_expires_at: attempt.attempt_expires_at,
      });
      if (attachResult.error) throw new CommerceCheckoutError('COMMERCE_CHECKOUT_RECOVERY_ATTACH_FAILED', { cause: attachResult.error });

      return {
        status: 'pending_reconciliation',
        orderId: order.order_id,
        paymentAttemptId: attempt.payment_attempt_id,
        providerPaymentId: error.providerPaymentId,
        providerStatus: error.providerStatus,
      };
    }

    const errorCode = error instanceof Error && /^[A-Za-z0-9_:-]{2,80}$/.test(error.message)
      ? error.message
      : 'provider_checkout_failed';
    const failResult = await deps.serviceClient.rpc('commerce_fail_payment_attempt', {
      p_payment_attempt_id: attempt.payment_attempt_id,
      p_error_code: errorCode,
      p_claim_token: claimToken,
    });
    if (failResult.error) throw new CommerceCheckoutError('COMMERCE_CHECKOUT_FAILURE_RECORD_FAILED', { cause: failResult.error });
    throw error;
  }

  const attachResult = await deps.serviceClient.rpc('commerce_attach_payment_checkout', {
    p_payment_attempt_id: attempt.payment_attempt_id,
    p_provider_payment_id: checkout.providerPaymentId,
    p_checkout_url: checkout.checkoutUrl,
    p_expires_at: checkout.expiresAt,
  });
  if (attachResult.error) throw new CommerceCheckoutError('COMMERCE_CHECKOUT_ATTACH_FAILED', { cause: attachResult.error });

  return {
    status: 'checkout_ready',
    orderId: order.order_id,
    paymentAttemptId: attempt.payment_attempt_id,
    providerPaymentId: checkout.providerPaymentId,
    checkoutUrl: checkout.checkoutUrl,
    expiresAt: checkout.expiresAt ?? attempt.attempt_expires_at,
  };
}
