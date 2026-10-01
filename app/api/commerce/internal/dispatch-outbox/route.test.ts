import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  dispatchCommerceOutbox: vi.fn(),
}));

vi.mock('@/lib/server/requireAdmin', () => ({ adminClient: mocks.adminClient }));
vi.mock('@/lib/server/commerceOutboxDispatcher', () => ({ dispatchCommerceOutbox: mocks.dispatchCommerceOutbox }));

import { POST } from './route';

const secret = 'commerce-worker-secret-32-characters-minimum';

function request(token?: string) {
  return new NextRequest('http://localhost:3000/api/commerce/internal/dispatch-outbox', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/commerce/internal/dispatch-outbox', () => {
  beforeEach(() => {
    process.env.COMMERCE_WORKER_SECRET = secret;
    vi.clearAllMocks();
    mocks.adminClient.mockReturnValue({ rpc: vi.fn() });
    mocks.dispatchCommerceOutbox.mockResolvedValue({
      claimed: 2,
      delivered: 1,
      retried: 1,
      deadLettered: 0,
      leaseLost: 0,
    });
  });

  afterEach(() => {
    delete process.env.COMMERCE_WORKER_SECRET;
  });

  it('dispatches a bounded batch with the internal bearer secret', async () => {
    const response = await POST(request(secret));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: 2,
      delivered: 1,
      retried: 1,
      deadLettered: 0,
      leaseLost: 0,
    });
    expect(mocks.dispatchCommerceOutbox).toHaveBeenCalledWith({
      serviceClient: expect.any(Object),
      limit: 20,
    });
  });

  it('rejects missing, incorrect and byte-length-mismatched secrets', async () => {
    for (const token of [undefined, `${secret}-wrong`, 'é'.repeat(secret.length)]) {
      expect((await POST(request(token))).status).toBe(401);
    }
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.dispatchCommerceOutbox).not.toHaveBeenCalled();
  });

  it('fails closed when worker configuration is incomplete', async () => {
    process.env.COMMERCE_WORKER_SECRET = 'short';
    expect((await POST(request('short'))).status).toBe(503);

    process.env.COMMERCE_WORKER_SECRET = secret;
    mocks.adminClient.mockReturnValueOnce(null);
    expect((await POST(request(secret))).status).toBe(503);
  });

  it('returns a retryable status without exposing delivery errors', async () => {
    mocks.dispatchCommerceOutbox.mockRejectedValueOnce(new Error('sensitive destination details'));
    const response = await POST(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Worker chưa phát xong outbox.' });
  });
});
