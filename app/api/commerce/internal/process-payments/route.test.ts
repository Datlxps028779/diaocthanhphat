import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  processCommercePaymentWebhooks: vi.fn(),
  processCommerceWalletPaymentWebhooks: vi.fn(),
}));

vi.mock('@/lib/server/requireAdmin', () => ({ adminClient: mocks.adminClient }));
vi.mock('@/lib/server/commercePaymentWorker', () => ({
  processCommercePaymentWebhooks: mocks.processCommercePaymentWebhooks,
}));
vi.mock('@/lib/server/commerceWalletWebhookWorker', () => ({
  processCommerceWalletPaymentWebhooks: mocks.processCommerceWalletPaymentWebhooks,
}));

import { POST } from './route';

const secret = 'commerce-worker-secret-32-characters-minimum';

function request(token?: string) {
  return new NextRequest('http://localhost:3000/api/commerce/internal/process-payments', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/commerce/internal/process-payments', () => {
  beforeEach(() => {
    process.env.COMMERCE_WORKER_SECRET = secret;
    mocks.adminClient.mockReset();
    mocks.processCommercePaymentWebhooks.mockReset();
    mocks.processCommerceWalletPaymentWebhooks.mockReset();
    mocks.adminClient.mockReturnValue({ rpc: vi.fn() });
    mocks.processCommercePaymentWebhooks.mockResolvedValue({
      claimed: 2,
      processed: 1,
      retried: 1,
      deadLettered: 0,
    });
    mocks.processCommerceWalletPaymentWebhooks.mockResolvedValue({ claimed: 0, processed: 0, retried: 0, deadLettered: 0 });
  });

  afterEach(() => {
    delete process.env.COMMERCE_WORKER_SECRET;
  });

  it('runs a bounded batch only with the internal bearer secret', async () => {
    const response = await POST(request(secret));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      walletPaymentEvents: { claimed: 0, processed: 0, retried: 0, deadLettered: 0 },
      paymentEvents: {
        claimed: 2,
        processed: 1,
        retried: 1,
        deadLettered: 0,
      },
    });
    expect(mocks.processCommerceWalletPaymentWebhooks).toHaveBeenCalledWith({
      serviceClient: expect.any(Object),
      limit: 10,
    });
    expect(mocks.processCommercePaymentWebhooks).toHaveBeenCalledWith({
      serviceClient: expect.any(Object),
      limit: 10,
    });
  });

  it('rejects missing or incorrect authorization before creating a service client', async () => {
    for (const token of [undefined, `${secret}-wrong`, 'é'.repeat(secret.length)]) {
      const response = await POST(request(token));
      expect(response.status).toBe(401);
    }
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.processCommercePaymentWebhooks).not.toHaveBeenCalled();
  });

  it('fails closed when worker or service-role configuration is missing', async () => {
    process.env.COMMERCE_WORKER_SECRET = 'short';
    expect((await POST(request('short'))).status).toBe(503);

    process.env.COMMERCE_WORKER_SECRET = secret;
    mocks.adminClient.mockReturnValueOnce(null);
    expect((await POST(request(secret))).status).toBe(503);
  });

  it('returns a retryable status without exposing worker errors', async () => {
    mocks.processCommercePaymentWebhooks.mockRejectedValueOnce(new Error('database details'));
    const response = await POST(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Worker chưa xử lý xong batch.' });
  });
});
