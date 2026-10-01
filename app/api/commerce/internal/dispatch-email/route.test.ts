import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  dispatchCommerceEmails: vi.fn(),
  createProvider: vi.fn(),
}));

vi.mock('@/lib/server/requireAdmin', () => ({ adminClient: mocks.adminClient }));
vi.mock('@/lib/server/commerceEmailDispatcher', () => ({ dispatchCommerceEmails: mocks.dispatchCommerceEmails }));
vi.mock('@/lib/server/smtpCommerceEmailProvider', () => ({ createSmtpCommerceEmailProviderFromEnv: mocks.createProvider }));
vi.mock('@/lib/siteUrl', () => ({ getSiteUrl: () => 'https://chonhaviet.com' }));

import { POST } from './route';

const secret = 'commerce-worker-secret-32-characters-minimum';

function request(token?: string) {
  return new NextRequest('http://localhost:3000/api/commerce/internal/dispatch-email', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/commerce/internal/dispatch-email', () => {
  beforeEach(() => {
    process.env.COMMERCE_WORKER_SECRET = secret;
    vi.clearAllMocks();
    mocks.adminClient.mockReturnValue({ rpc: vi.fn() });
    mocks.createProvider.mockReturnValue({ name: 'smtp', send: vi.fn() });
    mocks.dispatchCommerceEmails.mockResolvedValue({
      claimed: 2,
      sent: 1,
      retried: 1,
      deadLettered: 0,
      leaseLost: 0,
    });
  });

  afterEach(() => {
    delete process.env.COMMERCE_WORKER_SECRET;
  });

  it('dispatches a bounded batch only after provider configuration succeeds', async () => {
    const response = await POST(request(secret));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: 2, sent: 1, retried: 1, deadLettered: 0, leaseLost: 0,
    });
    expect(mocks.dispatchCommerceEmails).toHaveBeenCalledWith({
      serviceClient: expect.any(Object),
      provider: expect.objectContaining({ name: 'smtp' }),
      siteUrl: 'https://chonhaviet.com',
      limit: 20,
    });
  });

  it('rejects missing, incorrect and byte-length-mismatched secrets', async () => {
    for (const token of [undefined, `${secret}-wrong`, 'é'.repeat(secret.length)]) {
      expect((await POST(request(token))).status).toBe(401);
    }
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it('fails closed before claiming when SMTP configuration is missing', async () => {
    mocks.createProvider.mockImplementationOnce(() => { throw new Error('smtp secret details'); });
    const response = await POST(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Email worker chưa được cấu hình.' });
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.dispatchCommerceEmails).not.toHaveBeenCalled();
  });

  it('returns a retryable status without exposing delivery details', async () => {
    mocks.dispatchCommerceEmails.mockRejectedValueOnce(new Error('recipient and SMTP details'));
    const response = await POST(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Worker chưa gửi xong email.' });
  });
});
