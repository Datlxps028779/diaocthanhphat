import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PAYOS_CAPABILITIES, type CommercePaymentProvider } from '../commerceProvider';
import { createCommerceCheckout } from './commerceCheckout';
import { PayOSCheckoutRecoveryRequired } from './payosProvider';

const input = {
  packageVersionId: '11111111-1111-4111-8111-111111111111',
  quantity: 2,
  idempotencyKey: 'checkout_request_123456',
  siteUrl: 'http://localhost:3000/path',
};

const paymentKey = `payment:order-1:${createHash('sha256').update(input.idempotencyKey).digest('hex')}`;

function provider(): CommercePaymentProvider {
  return {
    name: 'payos',
    capabilities: PAYOS_CAPABILITIES,
    createCheckout: vi.fn(async () => ({
      provider: 'payos' as const,
      providerPaymentId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      expiresAt: '2027-01-15T08:00:00.000Z',
    })),
    verifyWebhook: vi.fn(),
    getPayment: vi.fn(),
  };
}

function clients() {
  const userClient = {
    rpc: vi.fn(async (name: string) => name === 'commerce_create_order'
      ? { data: [{ order_id: 'order-1', order_number: 7, total_minor: 100000, currency: 'VND' }], error: null }
      : {
          data: [{
            payment_attempt_id: 'attempt-1', provider_order_code: 123456,
            amount_minor: 100000, currency: 'VND', attempt_status: 'created',
            attempt_expires_at: '2027-01-15T08:00:00.000Z',
            provider_payment_id: null as string | null, checkout_url: null as string | null,
          }],
          error: null,
        }),
  };
  const serviceClient = {
    rpc: vi.fn(async (name: string) => ({ data: name === 'commerce_claim_payment_checkout' ? true : 'attempt-1', error: null })),
  };
  return { userClient, serviceClient };
}

describe('createCommerceCheckout', () => {
  it('persists order and attempt before calling payOS, then attaches provider checkout as service role', async () => {
    const db = clients();
    const payos = provider();
    await expect(createCommerceCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'checkout_ready',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      providerPaymentId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      expiresAt: '2027-01-15T08:00:00.000Z',
    });

    expect(db.userClient.rpc.mock.calls.map(call => call[0])).toEqual([
      'commerce_create_order',
      'commerce_start_payment_attempt',
    ]);
    expect(db.userClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_start_payment_attempt', {
      p_order_id: 'order-1',
      p_provider: 'payos',
      p_idempotency_key: paymentKey,
    });
    expect(payos.createCheckout).toHaveBeenCalledWith({
      orderId: 'order-1',
      orderNumber: '123456',
      amountMinor: 100000,
      currency: 'VND',
      description: 'CNV123456',
      returnUrl: 'http://localhost:3000/tai-khoan?payment=success',
      cancelUrl: 'http://localhost:3000/tai-khoan?payment=cancelled',
      expiresAt: '2027-01-15T08:00:00.000Z',
      idempotencyKey: paymentKey,
    });
    expect(db.serviceClient.rpc).toHaveBeenCalledWith('commerce_attach_payment_checkout', {
      p_payment_attempt_id: 'attempt-1',
      p_provider_payment_id: 'link-1',
      p_checkout_url: 'https://pay.payos.vn/web/link-1',
      p_expires_at: '2027-01-15T08:00:00.000Z',
    });
  });

  it('partitions payment idempotency by server-owned order id', async () => {
    const db = clients();
    db.userClient.rpc.mockImplementation(async (name: string) => name === 'commerce_create_order'
      ? { data: [{ order_id: 'order-2', order_number: 8, total_minor: 100000, currency: 'VND' }], error: null }
      : {
          data: [{
            payment_attempt_id: 'attempt-2', provider_order_code: 123457,
            amount_minor: 100000, currency: 'VND', attempt_status: 'created',
            attempt_expires_at: '2027-01-15T08:00:00.000Z',
            provider_payment_id: null, checkout_url: null,
          }],
          error: null,
        });
    const payos = provider();
    await createCommerceCheckout(input, { ...db, provider: payos });
    const secondKey = `payment:order-2:${createHash('sha256').update(input.idempotencyKey).digest('hex')}`;
    expect(secondKey).not.toBe(paymentKey);
    expect(db.userClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_start_payment_attempt', expect.objectContaining({
      p_idempotency_key: secondKey,
    }));
    expect(payos.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: secondKey }));
  });

  it('returns a stored attached checkout without calling payOS again', async () => {
    const db = clients();
    db.userClient.rpc.mockImplementation(async (name: string) => name === 'commerce_create_order'
      ? { data: [{ order_id: 'order-1', order_number: 7, total_minor: 100000, currency: 'VND' }], error: null }
      : {
          data: [{
            payment_attempt_id: 'attempt-1', provider_order_code: 123456,
            amount_minor: 100000, currency: 'VND', attempt_status: 'pending',
            attempt_expires_at: '2027-01-15T08:00:00.000Z',
            provider_payment_id: 'link-stored', checkout_url: 'https://pay.payos.vn/web/link-stored',
          }],
          error: null,
        });
    const payos = provider();
    await expect(createCommerceCheckout(input, { ...db, provider: payos })).resolves.toMatchObject({
      status: 'checkout_ready',
      providerPaymentId: 'link-stored',
      checkoutUrl: 'https://pay.payos.vn/web/link-stored',
    });
    expect(payos.createCheckout).not.toHaveBeenCalled();
    expect(db.serviceClient.rpc).not.toHaveBeenCalled();
  });

  it('returns reconciliation instead of reviving an expired stored checkout', async () => {
    const db = clients();
    db.userClient.rpc.mockImplementation(async (name: string) => name === 'commerce_create_order'
      ? { data: [{ order_id: 'order-1', order_number: 7, total_minor: 100000, currency: 'VND' }], error: null }
      : {
          data: [{
            payment_attempt_id: 'attempt-1', provider_order_code: 123456,
            amount_minor: 100000, currency: 'VND', attempt_status: 'pending',
            attempt_expires_at: '2020-01-01T00:00:00.000Z',
            provider_payment_id: 'link-stored', checkout_url: 'https://pay.payos.vn/web/link-stored',
          }],
          error: null,
        });
    const payos = provider();
    await expect(createCommerceCheckout(input, { ...db, provider: payos })).resolves.toMatchObject({
      status: 'pending_reconciliation',
      providerPaymentId: 'link-stored',
    });
    expect(payos.createCheckout).not.toHaveBeenCalled();
  });

  it('retries an existing owner order without creating a second order', async () => {
    const db = clients();
    const payos = provider();
    await expect(createCommerceCheckout({
      packageVersionId: null,
      orderId: 'order-1',
      quantity: 2,
      idempotencyKey: 'retry_existing_order_123',
      siteUrl: input.siteUrl,
    }, { ...db, provider: payos })).resolves.toMatchObject({ status: 'checkout_ready', orderId: 'order-1' });
    expect(db.userClient.rpc.mock.calls.map(call => call[0])).toEqual(['commerce_start_payment_attempt']);
    expect(payos.createCheckout).toHaveBeenCalled();
  });

  it('persists provider identity and returns pending reconciliation after a lost create response', async () => {
    const db = clients();
    const payos = provider();
    vi.mocked(payos.createCheckout).mockRejectedValueOnce(
      new PayOSCheckoutRecoveryRequired('link-existing', 'pending', 123456, 100000),
    );

    await expect(createCommerceCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'pending_reconciliation',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      providerPaymentId: 'link-existing',
      providerStatus: 'pending',
    });
    expect(db.serviceClient.rpc).toHaveBeenCalledWith('commerce_attach_payment_checkout', {
      p_payment_attempt_id: 'attempt-1',
      p_provider_payment_id: 'link-existing',
      p_checkout_url: null,
      p_expires_at: '2027-01-15T08:00:00.000Z',
    });
  });

  it('releases an owned claim when provider checkout fails', async () => {
    const db = clients();
    const payos = provider();
    vi.mocked(payos.createCheckout).mockRejectedValueOnce(new Error('connection_lost'));
    await expect(createCommerceCheckout(input, { ...db, provider: payos })).rejects.toThrow('connection_lost');
    expect(db.serviceClient.rpc.mock.calls.map(call => call[0])).toEqual([
      'commerce_claim_payment_checkout',
      'commerce_fail_payment_attempt',
    ]);
  });

  it('returns processing when another request owns the provider-call claim', async () => {
    const db = clients();
    db.serviceClient.rpc.mockResolvedValueOnce({ data: false, error: null });
    const payos = provider();
    await expect(createCommerceCheckout(input, { ...db, provider: payos })).resolves.toEqual({
      status: 'checkout_processing',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
    });
    expect(payos.createCheckout).not.toHaveBeenCalled();
  });

  it('rejects terminal unattached attempts before provider calls', async () => {
    const db = clients();
    db.userClient.rpc.mockImplementation(async (name: string) => name === 'commerce_create_order'
      ? { data: [{ order_id: 'order-1', order_number: 7, total_minor: 100000, currency: 'VND' }], error: null }
      : {
          data: [{
            payment_attempt_id: 'attempt-1', provider_order_code: 123456,
            amount_minor: 100000, currency: 'VND', attempt_status: 'failed',
            attempt_expires_at: '2027-01-15T08:00:00.000Z',
            provider_payment_id: null, checkout_url: null,
          }],
          error: null,
        });
    const payos = provider();
    await expect(createCommerceCheckout(input, { ...db, provider: payos })).rejects.toThrow('COMMERCE_PAYMENT_ATTEMPT_TERMINAL');
    expect(payos.createCheckout).not.toHaveBeenCalled();
    expect(db.serviceClient.rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid request boundaries before any RPC', async () => {
    const db = clients();
    await expect(createCommerceCheckout({ ...input, quantity: 0 }, { ...db, provider: provider() }))
      .rejects.toThrow('COMMERCE_QUANTITY_INVALID');
    await expect(createCommerceCheckout({ ...input, idempotencyKey: 'short' }, { ...db, provider: provider() }))
      .rejects.toThrow('COMMERCE_IDEMPOTENCY_KEY_INVALID');
    expect(db.userClient.rpc).not.toHaveBeenCalled();
  });
});
