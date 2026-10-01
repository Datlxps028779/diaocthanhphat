import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PayOSCheckoutRecoveryRequired, PayOSProvider } from './payosProvider';

const checkoutInput = {
  orderId: 'order-1',
  orderNumber: '123456',
  amountMinor: 50000,
  currency: 'VND' as const,
  description: 'CNV123456',
  returnUrl: 'https://chonhaviet.com/thanh-toan/thanh-cong',
  cancelUrl: 'https://chonhaviet.com/thanh-toan/huy',
  expiresAt: new Date(1_800_000_000 * 1000).toISOString(),
  idempotencyKey: 'checkout-order-1',
};

function client() {
  return {
    paymentRequests: {
      create: vi.fn(async () => ({
        paymentLinkId: 'link-1',
        checkoutUrl: 'https://pay.payos.vn/web/link-1',
        expiredAt: 1_800_000_000,
        amount: 50000,
        currency: 'VND',
        orderCode: 123456,
      })),
      get: vi.fn(async () => ({
        id: 'link-1',
        orderCode: 123456,
        amount: 50000,
        amountPaid: 50000,
        amountRemaining: 0,
        status: 'PAID' as const,
        createdAt: '2026-09-25T00:00:00Z',
        transactions: [{
          reference: 'tx-1',
          amount: 50000,
          accountNumber: 'masked',
          description: 'CNV123456',
          transactionDateTime: '2026-09-25T00:01:00Z',
          virtualAccountName: null,
          virtualAccountNumber: null,
          counterAccountBankId: null,
          counterAccountBankName: null,
          counterAccountName: null,
          counterAccountNumber: null,
        }],
        cancellationReason: null,
        canceledAt: null,
      })),
    },
    webhooks: {
      verify: vi.fn(async () => ({
        orderCode: 123456,
        amount: 50000,
        description: 'CNV123456',
        accountNumber: 'masked',
        reference: 'tx-1',
        transactionDateTime: '2026-09-25T00:01:00Z',
        currency: 'VND',
        paymentLinkId: 'link-1',
        code: '00',
        desc: 'success',
        counterAccountBankId: 'bank-id',
        counterAccountBankName: 'Sensitive Bank',
        counterAccountName: 'Sensitive Name',
        counterAccountNumber: 'sensitive-counter-account',
        virtualAccountName: 'Sensitive Virtual Name',
        virtualAccountNumber: 'sensitive-virtual-account',
      })),
    },
  };
}

describe('PayOSProvider', () => {
  it('creates a hosted checkout from server-owned amount and order number', async () => {
    const sdk = client();
    const provider = new PayOSProvider(sdk);
    await expect(provider.createCheckout(checkoutInput)).resolves.toEqual({
      provider: 'payos',
      providerPaymentId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      expiresAt: new Date(1_800_000_000 * 1000).toISOString(),
    });
    expect(sdk.paymentRequests.create).toHaveBeenCalledWith({
      orderCode: 123456,
      amount: 50000,
      description: 'CNV123456',
      cancelUrl: checkoutInput.cancelUrl,
      returnUrl: checkoutInput.returnUrl,
      expiredAt: 1_800_000_000,
    }, { maxRetries: 0, timeout: 10_000 });
  });

  it('rejects unsupported currency, unsafe order codes and provider amount drift', async () => {
    const sdk = client();
    const provider = new PayOSProvider(sdk);
    await expect(provider.createCheckout({ ...checkoutInput, currency: 'USD' as never })).rejects.toThrow('payos_currency_unsupported');
    await expect(provider.createCheckout({ ...checkoutInput, orderNumber: '9007199254740992' })).rejects.toThrow('payos_order_code_invalid');
    await expect(provider.createCheckout({ ...checkoutInput, expiresAt: '2020-01-01T00:00:00.000Z' })).rejects.toThrow('payos_expiry_invalid');
    sdk.paymentRequests.create.mockResolvedValueOnce({
      paymentLinkId: 'link-1', checkoutUrl: 'https://pay.payos.vn/web/link-1', expiredAt: 1_800_000_000,
      amount: 1, currency: 'VND', orderCode: 123456,
    });
    await expect(provider.createCheckout(checkoutInput)).rejects.toThrow('payos_checkout_response_mismatch');
    sdk.paymentRequests.create.mockResolvedValueOnce({
      paymentLinkId: 'link-2', checkoutUrl: 'https://pay.payos.vn/web/link-2', expiredAt: 1_800_000_000,
      amount: 50000, currency: 'VND', orderCode: 654321,
    });
    await expect(provider.createCheckout(checkoutInput)).rejects.toThrow('payos_checkout_response_mismatch');
  });

  it('verifies webhook through the SDK and hashes the exact raw body', async () => {
    const sdk = client();
    const provider = new PayOSProvider(sdk);
    const rawBody = JSON.stringify({ code: '00', desc: 'success', success: true, data: {}, signature: 'signed' });
    await expect(provider.verifyWebhook({ rawBody, headers: {} })).resolves.toEqual({
      provider: 'payos',
      providerEventId: 'tx-1',
      providerPaymentId: 'link-1',
      eventType: 'payment.succeeded',
      amountMinor: 50000,
      currency: 'VND',
      occurredAt: '2026-09-25T00:01:00Z',
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
      signedDataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      payload: {
        source: 'payos_webhook',
        orderCode: 123456,
        providerEventId: 'tx-1',
        providerPaymentId: 'link-1',
        statusCode: '00',
        amountMinor: 50000,
        currency: 'VND',
        occurredAt: '2026-09-25T00:01:00Z',
      },
    });
    expect(sdk.webhooks.verify).toHaveBeenCalledWith(JSON.parse(rawBody));
    const event = await provider.verifyWebhook({ rawBody, headers: {} });
    expect(JSON.stringify(event.payload)).not.toContain('masked');
    expect(JSON.stringify(event.payload)).not.toContain('Sensitive');
    expect(JSON.stringify(event.payload)).not.toContain('sensitive-counter-account');
    expect(JSON.stringify(event.payload)).not.toContain('sensitive-virtual-account');
    expect(event.payload).not.toHaveProperty('accountNumber');
    expect(event.payload).not.toHaveProperty('counterAccountNumber');
  });

  it('uses a signed-data-derived event id when provider omits a transaction reference', async () => {
    const sdk = client();
    sdk.webhooks.verify.mockResolvedValue({
      orderCode: 123456,
      amount: 50000,
      description: 'CNV123456',
      accountNumber: 'masked',
      reference: '',
      transactionDateTime: '2026-09-25T00:01:00Z',
      currency: 'VND',
      paymentLinkId: 'link-1',
      code: '01',
      desc: 'underpaid',
      counterAccountBankId: '',
      counterAccountBankName: '',
      counterAccountName: '',
      counterAccountNumber: '',
      virtualAccountName: '',
      virtualAccountNumber: '',
    });
    const provider = new PayOSProvider(sdk);
    const first = await provider.verifyWebhook({ rawBody: '{"first":true}', headers: {} });
    const second = await provider.verifyWebhook({ rawBody: '{"first":false}', headers: {} });
    expect(first.eventType).toBe('payment.failed');
    expect(first.providerEventId).toMatch(/^payos:link-1:[0-9a-f]{64}$/);
    expect(first.providerEventId).toBe(second.providerEventId);
  });

  it('derives payment status only from signed webhook data', async () => {
    const provider = new PayOSProvider(client());
    const rawBody = JSON.stringify({ code: 'tampered', desc: 'tampered', success: false, data: {}, signature: 'signed' });
    const event = await provider.verifyWebhook({ rawBody, headers: {} });
    expect(event.eventType).toBe('payment.succeeded');
  });

  it('keeps signed-data fingerprint stable across raw JSON formatting and unsigned envelope changes', async () => {
    const provider = new PayOSProvider(client());
    const compact = JSON.stringify({ code: '00', desc: 'success', success: true, data: {}, signature: 'signed' });
    const reformatted = JSON.stringify({ signature: 'signed', data: {}, success: false, desc: 'changed', code: 'changed' }, null, 2);
    const first = await provider.verifyWebhook({ rawBody: compact, headers: {} });
    const second = await provider.verifyWebhook({ rawBody: reformatted, headers: {} });
    expect(first.payloadHash).not.toBe(second.payloadHash);
    expect(first.signedDataHash).toBe(second.signedDataHash);
    expect(first.providerEventId).toBe(second.providerEventId);
  });

  it('returns a structured recovery signal instead of blindly recreating a lost checkout response', async () => {
    const sdk = client();
    sdk.paymentRequests.create.mockRejectedValueOnce(new Error('connection_lost'));
    const provider = new PayOSProvider(sdk);
    const error = await provider.createCheckout(checkoutInput).catch(value => value);
    expect(error).toBeInstanceOf(PayOSCheckoutRecoveryRequired);
    expect(error).toMatchObject({
      message: 'payos_checkout_recovery_required',
      providerPaymentId: 'link-1',
      providerStatus: 'succeeded',
      orderCode: 123456,
      amountMinor: 50000,
    });
    expect(sdk.paymentRequests.get).toHaveBeenCalledWith(123456, { maxRetries: 0, timeout: 10_000 });
  });

  it('rejects checkout recovery when provider order identity or amount differs', async () => {
    const sdk = client();
    const existing = await sdk.paymentRequests.get();
    sdk.paymentRequests.get.mockClear();
    sdk.paymentRequests.create.mockRejectedValueOnce(new Error('duplicate_order_code'));
    sdk.paymentRequests.get.mockResolvedValueOnce({ ...existing, amount: 1 });
    const provider = new PayOSProvider(sdk);
    await expect(provider.createCheckout(checkoutInput)).rejects.toThrow('payos_checkout_recovery_mismatch');
    expect(sdk.paymentRequests.get).toHaveBeenCalledWith(123456, { maxRetries: 0, timeout: 10_000 });

    const orderMismatchSdk = client();
    const orderMismatchExisting = await orderMismatchSdk.paymentRequests.get();
    orderMismatchSdk.paymentRequests.get.mockClear();
    orderMismatchSdk.paymentRequests.create.mockRejectedValueOnce(new Error('duplicate_order_code'));
    orderMismatchSdk.paymentRequests.get.mockResolvedValueOnce({ ...orderMismatchExisting, orderCode: 654321 });
    const orderMismatchProvider = new PayOSProvider(orderMismatchSdk);
    await expect(orderMismatchProvider.createCheckout(checkoutInput)).rejects.toThrow('payos_checkout_recovery_mismatch');
    expect(orderMismatchSdk.paymentRequests.get).toHaveBeenCalledWith(123456, { maxRetries: 0, timeout: 10_000 });
  });

  it('maps provider payment status for reconciliation with a bounded lookup', async () => {
    const sdk = client();
    const provider = new PayOSProvider(sdk);
    await expect(provider.getPayment('link-1')).resolves.toEqual({
      provider: 'payos',
      providerPaymentId: 'link-1',
      status: 'succeeded',
      amountMinor: 50000,
      currency: 'VND',
      paidAt: '2026-09-25T00:01:00Z',
    });
    expect(sdk.paymentRequests.get).toHaveBeenCalledWith('link-1', { maxRetries: 0, timeout: 10_000 });
  });
});
