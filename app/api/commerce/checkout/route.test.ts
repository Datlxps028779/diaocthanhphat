import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const caller = { auth: { getUser } };
  const service = { rpc: vi.fn() };
  return {
    getUser,
    caller,
    service,
    callerClient: vi.fn(() => caller),
    adminClient: vi.fn((): typeof service | null => service),
    createCommerceCheckout: vi.fn(),
    createPayOSProviderFromEnv: vi.fn(() => ({ name: 'payos' })),
  };
});

vi.mock('@/lib/server/requireAdmin', () => ({ callerClient: mocks.callerClient, adminClient: mocks.adminClient }));
vi.mock('@/lib/server/commerceCheckout', () => ({
  CommerceCheckoutError: class CommerceCheckoutError extends Error {
    constructor(readonly code: string) { super(code); }
  },
  createCommerceCheckout: mocks.createCommerceCheckout,
}));
vi.mock('@/lib/server/payosProvider', () => ({ createPayOSProviderFromEnv: mocks.createPayOSProviderFromEnv }));
vi.mock('@/lib/siteUrl', () => ({ getSiteUrl: () => 'http://localhost:3000' }));

const { getUser, caller, service, callerClient, adminClient, createCommerceCheckout } = mocks;

import { POST } from './route';

const payload = {
  package_version_id: '11111111-1111-4111-8111-111111111111',
  quantity: 1,
  idempotency_key: 'checkout_request_123456',
};

function request(body: unknown, token = 'token') {
  return new NextRequest('http://localhost:3000/api/commerce/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/commerce/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminClient.mockReturnValue(service);
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('rejects malformed payload before authentication or provider calls', async () => {
    const response = await POST(request({ ...payload, quantity: 0 }));
    expect(response.status).toBe(400);
    expect(callerClient).not.toHaveBeenCalled();
    expect(createCommerceCheckout).not.toHaveBeenCalled();
  });

  it('requires a valid authenticated user session', async () => {
    expect((await POST(request(payload, ''))).status).toBe(401);
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid') });
    expect((await POST(request(payload))).status).toBe(401);
    expect(createCommerceCheckout).not.toHaveBeenCalled();
  });

  it('fails closed when service role payment boundary is unavailable', async () => {
    adminClient.mockReturnValueOnce(null);
    const response = await POST(request(payload));
    expect(response.status).toBe(503);
    expect(createCommerceCheckout).not.toHaveBeenCalled();
  });

  it('returns checkout URL only after orchestration succeeds', async () => {
    createCommerceCheckout.mockResolvedValueOnce({
      status: 'checkout_ready',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      providerPaymentId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      expiresAt: '2027-01-15T08:00:00.000Z',
    });
    const response = await POST(request(payload));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ status: 'checkout_ready', checkoutUrl: 'https://pay.payos.vn/web/link-1' });
    expect(createCommerceCheckout).toHaveBeenCalledWith({
      packageVersionId: payload.package_version_id,
      quantity: 1,
      idempotencyKey: payload.idempotency_key,
      orderId: undefined,
      siteUrl: 'http://localhost:3000',
    }, expect.objectContaining({ userClient: caller, serviceClient: service }));
  });

  it('returns 202 without checkout URL when provider recovery needs reconciliation', async () => {
    createCommerceCheckout.mockResolvedValueOnce({
      status: 'pending_reconciliation',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      providerPaymentId: 'link-1',
      providerStatus: 'pending',
    });
    const response = await POST(request(payload));
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe('pending_reconciliation');
    expect(body.checkoutUrl).toBeUndefined();
  });

  it('returns 202 while another worker owns the provider-call claim', async () => {
    createCommerceCheckout.mockResolvedValueOnce({
      status: 'checkout_processing',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
    });
    const response = await POST(request(payload));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: 'checkout_processing',
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
    });
  });

  it('returns a bounded error without leaking provider or database details', async () => {
    createCommerceCheckout.mockRejectedValueOnce(new Error('secret provider payload'));
    const response = await POST(request(payload));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Chưa tạo được phiên thanh toán.',
      code: 'COMMERCE_CHECKOUT_UNAVAILABLE',
    });
  });
});
