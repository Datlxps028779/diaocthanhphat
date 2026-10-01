import { randomUUID } from 'node:crypto';
import type { CommercePaymentProvider } from '../commerceProvider';
import { PayOSCheckoutRecoveryRequired } from './payosProvider';

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type WalletTopupCheckoutRow = {
  topup_checkout_id: string;
  topup_intent_id: string;
  provider_order_code: string | number;
  amount_minor: string | number;
  currency: string;
  checkout_status: string;
  checkout_expires_at: string;
  provider_payment_id: string | null;
  checkout_url: string | null;
};

export type CommerceWalletTopupCheckoutInput = {
  topupIntentId: string;
  idempotencyKey: string;
  siteUrl: string;
};

export type CommerceWalletTopupCheckoutResult =
  | {
      status: 'checkout_ready';
      topupIntentId: string;
      topupCheckoutId: string;
      providerPaymentId: string;
      checkoutUrl: string;
      expiresAt: string;
    }
  | {
      status: 'checkout_processing';
      topupIntentId: string;
      topupCheckoutId: string;
    }
  | {
      status: 'pending_reconciliation';
      topupIntentId: string;
      topupCheckoutId: string;
      providerPaymentId: string;
      providerStatus: string;
    };

export class CommerceWalletTopupError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommerceWalletTopupError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstRow(data: unknown): WalletTopupCheckoutRow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_RPC_INVALID_RESPONSE');
  return row as WalletTopupCheckoutRow;
}

function positiveInteger(value: string | number, code: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new CommerceWalletTopupError(code);
  return parsed;
}

function checkoutDescription(providerOrderCode: number): string {
  return `CNVW${String(providerOrderCode).slice(-5).padStart(5, '0')}`;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_:-]{2,80}$/.test(error.message)) return error.message;
  return 'provider_checkout_unknown';
}

export async function createCommerceWalletTopupCheckout(input: CommerceWalletTopupCheckoutInput, deps: {
  userClient: RpcClient;
  serviceClient: RpcClient;
  provider: CommercePaymentProvider;
}): Promise<CommerceWalletTopupCheckoutResult> {
  if (!UUID_RE.test(input.topupIntentId)) {
    throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_INTENT_INVALID');
  }
  if (!/^[A-Za-z0-9_-]{16,140}$/.test(input.idempotencyKey)) {
    throw new CommerceWalletTopupError('COMMERCE_IDEMPOTENCY_KEY_INVALID');
  }

  const startResult = await deps.userClient.rpc('commerce_start_wallet_topup_checkout', {
    p_topup_intent_id: input.topupIntentId,
    p_provider: deps.provider.name,
    p_idempotency_key: input.idempotencyKey,
  });
  if (startResult.error) {
    throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_CHECKOUT_START_FAILED', { cause: startResult.error });
  }

  const checkoutState = firstRow(startResult.data);
  const providerOrderCode = positiveInteger(
    checkoutState.provider_order_code,
    'COMMERCE_PROVIDER_ORDER_CODE_INVALID',
  );
  const amountMinor = positiveInteger(checkoutState.amount_minor, 'COMMERCE_AMOUNT_INVALID');
  if (checkoutState.currency !== 'VND') throw new CommerceWalletTopupError('COMMERCE_CURRENCY_INVALID');
  const expiresAtMs = Date.parse(checkoutState.checkout_expires_at);
  if (!Number.isFinite(expiresAtMs)) throw new CommerceWalletTopupError('COMMERCE_CHECKOUT_EXPIRY_INVALID');

  if (checkoutState.provider_payment_id) {
    if (
      checkoutState.checkout_url
      && expiresAtMs > Date.now()
      && checkoutState.checkout_status === 'pending'
    ) {
      return {
        status: 'checkout_ready',
        topupIntentId: checkoutState.topup_intent_id,
        topupCheckoutId: checkoutState.topup_checkout_id,
        providerPaymentId: checkoutState.provider_payment_id,
        checkoutUrl: checkoutState.checkout_url,
        expiresAt: checkoutState.checkout_expires_at,
      };
    }
    return {
      status: 'pending_reconciliation',
      topupIntentId: checkoutState.topup_intent_id,
      topupCheckoutId: checkoutState.topup_checkout_id,
      providerPaymentId: checkoutState.provider_payment_id,
      providerStatus: checkoutState.checkout_status,
    };
  }

  if (!['created', 'creating', 'recovery_required'].includes(checkoutState.checkout_status)) {
    throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_CHECKOUT_TERMINAL');
  }

  const claimToken = randomUUID();
  const claimResult = await deps.serviceClient.rpc('commerce_claim_wallet_topup_checkout', {
    p_topup_checkout_id: checkoutState.topup_checkout_id,
    p_claim_token: claimToken,
  });
  if (claimResult.error) {
    throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_CHECKOUT_CLAIM_FAILED', { cause: claimResult.error });
  }
  if (claimResult.data !== true) {
    return {
      status: 'checkout_processing',
      topupIntentId: checkoutState.topup_intent_id,
      topupCheckoutId: checkoutState.topup_checkout_id,
    };
  }

  const baseUrl = new URL(input.siteUrl).origin;
  try {
    const checkout = await deps.provider.createCheckout({
      orderId: checkoutState.topup_intent_id,
      orderNumber: String(providerOrderCode),
      amountMinor,
      currency: 'VND',
      description: checkoutDescription(providerOrderCode),
      returnUrl: `${baseUrl}/tai-khoan?tab=commerce&payment=success`,
      cancelUrl: `${baseUrl}/tai-khoan?tab=commerce&payment=cancelled`,
      expiresAt: checkoutState.checkout_expires_at,
      idempotencyKey: input.idempotencyKey,
    });
    const attachExpiresAt = checkout.expiresAt ?? checkoutState.checkout_expires_at;
    const attachResult = await deps.serviceClient.rpc('commerce_attach_wallet_topup_checkout', {
      p_topup_checkout_id: checkoutState.topup_checkout_id,
      p_claim_token: claimToken,
      p_provider_payment_id: checkout.providerPaymentId,
      p_checkout_url: checkout.checkoutUrl,
      p_expires_at: attachExpiresAt,
    });
    if (attachResult.error) {
      const recoveryResult = await deps.serviceClient.rpc('commerce_recover_wallet_topup_checkout', {
        p_topup_checkout_id: checkoutState.topup_checkout_id,
        p_claim_token: claimToken,
        p_provider_payment_id: checkout.providerPaymentId,
        p_error_code: 'checkout_attach_failed',
      });
      if (recoveryResult.error) {
        throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_RECOVERY_RECORD_FAILED', { cause: recoveryResult.error });
      }
      return {
        status: 'pending_reconciliation',
        topupIntentId: checkoutState.topup_intent_id,
        topupCheckoutId: checkoutState.topup_checkout_id,
        providerPaymentId: checkout.providerPaymentId,
        providerStatus: 'pending',
      };
    }
    return {
      status: 'checkout_ready',
      topupIntentId: checkoutState.topup_intent_id,
      topupCheckoutId: checkoutState.topup_checkout_id,
      providerPaymentId: checkout.providerPaymentId,
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: attachExpiresAt,
    };
  } catch (error) {
    if (error instanceof CommerceWalletTopupError) throw error;
    const recovery = error instanceof PayOSCheckoutRecoveryRequired
      ? {
          providerPaymentId: error.providerPaymentId,
          providerStatus: error.providerStatus,
          code: error.message,
        }
      : {
          providerPaymentId: null,
          providerStatus: 'unknown',
          code: errorCode(error),
        };
    const recoveryResult = await deps.serviceClient.rpc('commerce_recover_wallet_topup_checkout', {
      p_topup_checkout_id: checkoutState.topup_checkout_id,
      p_claim_token: claimToken,
      p_provider_payment_id: recovery.providerPaymentId,
      p_error_code: recovery.code,
    });
    if (recoveryResult.error) {
      throw new CommerceWalletTopupError('COMMERCE_WALLET_TOPUP_RECOVERY_RECORD_FAILED', { cause: recoveryResult.error });
    }
    if (recovery.providerPaymentId) {
      return {
        status: 'pending_reconciliation',
        topupIntentId: checkoutState.topup_intent_id,
        topupCheckoutId: checkoutState.topup_checkout_id,
        providerPaymentId: recovery.providerPaymentId,
        providerStatus: recovery.providerStatus,
      };
    }
    throw error;
  }
}
