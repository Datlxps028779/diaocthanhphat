import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  createPayOSProviderFromEnv: vi.fn(),
  reconcileCommercePayments: vi.fn(),
  processCommercePaymentWebhooks: vi.fn(),
  reconcileCommerceWalletTopups: vi.fn(),
  processCommerceWalletPaymentWebhooks: vi.fn(),
}));

vi.mock('@/lib/server/requireAdmin', () => ({ adminClient: mocks.adminClient }));
vi.mock('@/lib/server/payosProvider', () => ({ createPayOSProviderFromEnv: mocks.createPayOSProviderFromEnv }));
vi.mock('@/lib/server/commercePaymentReconciliation', () => ({ reconcileCommercePayments: mocks.reconcileCommercePayments }));
vi.mock('@/lib/server/commercePaymentWorker', () => ({ processCommercePaymentWebhooks: mocks.processCommercePaymentWebhooks }));
vi.mock('@/lib/server/commerceWalletWebhookWorker', () => ({
  reconcileCommerceWalletTopups: mocks.reconcileCommerceWalletTopups,
  processCommerceWalletPaymentWebhooks: mocks.processCommerceWalletPaymentWebhooks,
}));

import { POST } from './route';

const secret = 'commerce-worker-secret-32-characters-minimum';

function request(token?: string) {
  return new NextRequest('http://localhost:3000/api/commerce/internal/reconcile-payments', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/commerce/internal/reconcile-payments', () => {
  beforeEach(() => {
    process.env.COMMERCE_WORKER_SECRET = secret;
    vi.clearAllMocks();
    mocks.adminClient.mockReturnValue({ rpc: vi.fn() });
    mocks.createPayOSProviderFromEnv.mockReturnValue({ name: 'payos' });
    mocks.reconcileCommercePayments.mockResolvedValue({ claimed: 1, eventsEnqueued: 1 });
    mocks.processCommercePaymentWebhooks.mockResolvedValue({ claimed: 1, processed: 1 });
    mocks.reconcileCommerceWalletTopups.mockResolvedValue({ claimed: 0, eventsEnqueued: 0 });
    mocks.processCommerceWalletPaymentWebhooks.mockResolvedValue({ claimed: 0, processed: 0, retried: 0, deadLettered: 0 });
  });

  afterEach(() => {
    delete process.env.COMMERCE_WORKER_SECRET;
  });

  it('reconciles provider state then drains the durable event inbox', async () => {
    const response = await POST(request(secret));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      walletReconciliation: { claimed: 0, eventsEnqueued: 0 },
      walletPaymentEvents: { claimed: 0, processed: 0, retried: 0, deadLettered: 0 },
      reconciliation: { claimed: 1, eventsEnqueued: 1 },
      paymentEvents: { claimed: 1, processed: 1 },
    });
    expect(mocks.reconcileCommercePayments).toHaveBeenCalledWith({
      serviceClient: expect.any(Object),
      providers: { payos: { name: 'payos' } },
      limit: 10,
    });
    expect(mocks.processCommercePaymentWebhooks.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.reconcileCommercePayments.mock.invocationCallOrder[0],
    );
  });

  it('rejects missing, incorrect and byte-length-mismatched secrets', async () => {
    for (const token of [undefined, `${secret}-wrong`, 'é'.repeat(secret.length)]) {
      expect((await POST(request(token))).status).toBe(401);
    }
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it('fails closed before claiming jobs when configuration is incomplete', async () => {
    process.env.COMMERCE_WORKER_SECRET = 'short';
    expect((await POST(request('short'))).status).toBe(503);

    process.env.COMMERCE_WORKER_SECRET = secret;
    mocks.adminClient.mockReturnValueOnce(null);
    expect((await POST(request(secret))).status).toBe(503);

    mocks.createPayOSProviderFromEnv.mockImplementationOnce(() => { throw new Error('missing'); });
    expect((await POST(request(secret))).status).toBe(503);
    expect(mocks.reconcileCommercePayments).not.toHaveBeenCalled();
  });

  it('returns retryable failure without exposing provider or database details', async () => {
    mocks.reconcileCommercePayments.mockRejectedValueOnce(new Error('sensitive details'));
    const response = await POST(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Worker chưa đối soát xong batch.' });
  });
});
