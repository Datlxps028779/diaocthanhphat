import { describe, expect, it, vi } from 'vitest';
import { PAYOS_CAPABILITIES, type CommercePaymentProvider } from '../commerceProvider';
import { createCommerceWalletTopupCheckout } from './commerceWalletTopup';
import { PayOSCheckoutRecoveryRequired } from './payosProvider';

const topupIntentId = '11111111-1111-4111-8111-111111111111';
const input = {
  topupIntentId,
  idempotencyKey: 'wallet_checkout_request_001',
  siteUrl: 'http://localhost:3000/path',
};

function provider(): CommercePaymentProvider {
  return {
    name: 'payos',
    capabilities: PAYOS_CAPABILITIES,
    createCheckout: vi.fn(async () => ({
      provider: 'payos' as const,
      providerPaymentId: 'wallet-link-1',
      checkoutUrl: 'https://pay.payos.vn/web/wallet-link-1',
      expiresAt: '2027-01-15T08:00:00.000Z',
    })),
    verifyWebhook: vi.fn(),
    getPayment: vi.fn(),
  };
}

function clients() {
  const userClient = {
    rpc: vi.fn(async () => ({
      data: [{
        topup_checkout_id: 'checkout-1',
        topup_intent_id: topupIntentId,
        provider_order_code: 123456,
        amount_minor: 100000,
        currency: 'VND',
        checkout_status: 'created',
        checkout_expires_at: '2027-01-15T08:00:00.000Z',
        provider_payment_id: null as string | null,
        checkout_url: null as string | null,
      }],
      error: null,
    })),
  };
  const serviceClient = {
    rpc: vi.fn(async (name: string): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> => ({
      data: name === 'commerce_claim_wallet_topup_checkout' ? true : 'checkout-1',
      error: null,
    })),
  };
  return { userClient, serviceClient };
}

describe('createCommerceWalletTopupCheckout', () => {
  it('persists and claims the server-priced checkout before calling the provider', async () => {
    const db = clients();
    const payos = provider();

    await expect(createCommerceWalletTopupCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'checkout_ready',
      topupIntentId,
      topupCheckoutId: 'checkout-1',
      providerPaymentId: 'wallet-link-1',
      checkoutUrl: 'https://pay.payos.vn/web/wallet-link-1',
      expiresAt: '2027-01-15T08:00:00.000Z',
    });

    expect(db.userClient.rpc).toHaveBeenCalledWith('commerce_start_wallet_topup_checkout', {
      p_topup_intent_id: topupIntentId,
      p_provider: 'payos',
      p_idempotency_key: input.idempotencyKey,
    });
    expect(payos.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      orderId: topupIntentId,
      orderNumber: '123456',
      amountMinor: 100000,
      currency: 'VND',
      description: 'CNVW23456',
      returnUrl: 'http://localhost:3000/tai-khoan?tab=commerce&payment=success',
      cancelUrl: 'http://localhost:3000/tai-khoan?tab=commerce&payment=cancelled',
    }));
    expect(db.serviceClient.rpc).toHaveBeenLastCalledWith('commerce_attach_wallet_topup_checkout', expect.objectContaining({
      p_topup_checkout_id: 'checkout-1',
      p_provider_payment_id: 'wallet-link-1',
      p_checkout_url: 'https://pay.payos.vn/web/wallet-link-1',
    }));
  });

  it('replays a stored live checkout without calling the provider', async () => {
    const db = clients();
    db.userClient.rpc.mockResolvedValueOnce({
      data: [{
        topup_checkout_id: 'checkout-1', topup_intent_id: topupIntentId, provider_order_code: 123456,
        amount_minor: 100000, currency: 'VND', checkout_status: 'pending',
        checkout_expires_at: '2027-01-15T08:00:00.000Z', provider_payment_id: 'wallet-link-stored',
        checkout_url: 'https://pay.payos.vn/web/wallet-link-stored',
      }],
      error: null,
    });
    const payos = provider();

    await expect(createCommerceWalletTopupCheckout(input, { ...db, provider: payos })).resolves.toMatchObject({
      status: 'checkout_ready',
      providerPaymentId: 'wallet-link-stored',
    });
    expect(payos.createCheckout).not.toHaveBeenCalled();
    expect(db.serviceClient.rpc).not.toHaveBeenCalled();
  });

  it('moves a provider success into recovery when durable attach fails', async () => {
    const db = clients();
    db.serviceClient.rpc.mockImplementation(async (name: string) => {
      if (name === 'commerce_claim_wallet_topup_checkout') return { data: true, error: null };
      if (name === 'commerce_attach_wallet_topup_checkout') return { data: null, error: { code: 'XX000', message: 'attach failed' } };
      return { data: 'checkout-1', error: null };
    });
    const payos = provider();

    await expect(createCommerceWalletTopupCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'pending_reconciliation',
      topupIntentId,
      topupCheckoutId: 'checkout-1',
      providerPaymentId: 'wallet-link-1',
      providerStatus: 'pending',
    });
    expect(db.serviceClient.rpc.mock.calls.map(call => call[0])).toEqual([
      'commerce_claim_wallet_topup_checkout',
      'commerce_attach_wallet_topup_checkout',
      'commerce_recover_wallet_topup_checkout',
    ]);
  });

  it('records provider identity for lost-response recovery', async () => {
    const db = clients();
    const payos = provider();
    vi.mocked(payos.createCheckout).mockRejectedValueOnce(
      new PayOSCheckoutRecoveryRequired('wallet-link-existing', 'pending', 123456, 100000),
    );

    await expect(createCommerceWalletTopupCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'pending_reconciliation',
      topupIntentId,
      topupCheckoutId: 'checkout-1',
      providerPaymentId: 'wallet-link-existing',
      providerStatus: 'pending',
    });
    expect(db.serviceClient.rpc).toHaveBeenLastCalledWith('commerce_recover_wallet_topup_checkout', expect.objectContaining({
      p_topup_checkout_id: 'checkout-1',
      p_provider_payment_id: 'wallet-link-existing',
      p_error_code: 'payos_checkout_recovery_required',
    }));
  });

  it('keeps an unknown provider failure in recovery instead of marking payment failed', async () => {
    const db = clients();
    const payos = provider();
    vi.mocked(payos.createCheckout).mockRejectedValueOnce(new Error('connection_lost'));

    await expect(createCommerceWalletTopupCheckout(input, { ...db, provider: payos })).rejects.toThrow('connection_lost');
    expect(db.serviceClient.rpc.mock.calls.map(call => call[0])).toEqual([
      'commerce_claim_wallet_topup_checkout',
      'commerce_recover_wallet_topup_checkout',
    ]);
    expect(db.serviceClient.rpc).toHaveBeenLastCalledWith('commerce_recover_wallet_topup_checkout', expect.objectContaining({
      p_provider_payment_id: null,
      p_error_code: 'connection_lost',
    }));
  });

  it('returns processing when another worker owns the claim', async () => {
    const db = clients();
    db.serviceClient.rpc.mockResolvedValueOnce({ data: false, error: null });
    const payos = provider();

    await expect(createCommerceWalletTopupCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'checkout_processing',
      topupIntentId,
      topupCheckoutId: 'checkout-1',
    });
    expect(payos.createCheckout).not.toHaveBeenCalled();
  });

  it('rejects invalid input before any RPC or provider call', async () => {
    const db = clients();
    const payos = provider();
    await expect(createCommerceWalletTopupCheckout({ ...input, topupIntentId: 'not-a-uuid' }, { ...db, provider: payos }))
      .rejects.toThrow('COMMERCE_WALLET_TOPUP_INTENT_INVALID');
    await expect(createCommerceWalletTopupCheckout({ ...input, idempotencyKey: 'short' }, { ...db, provider: payos }))
      .rejects.toThrow('COMMERCE_IDEMPOTENCY_KEY_INVALID');
    expect(db.userClient.rpc).not.toHaveBeenCalled();
    expect(payos.createCheckout).not.toHaveBeenCalled();
  });
});
