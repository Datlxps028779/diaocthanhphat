import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const verifyWebhook = vi.fn();
  return {
    rpc,
    verifyWebhook,
    adminClient: vi.fn((): { rpc: typeof rpc } | null => ({ rpc })),
    createPayOSProviderFromEnv: vi.fn(() => ({ verifyWebhook })),
  };
});

vi.mock('@/lib/server/requireAdmin', () => ({ adminClient: mocks.adminClient }));
vi.mock('@/lib/server/payosProvider', () => ({ createPayOSProviderFromEnv: mocks.createPayOSProviderFromEnv }));

import { POST } from './route';

function request(body: string) {
  return new NextRequest('http://localhost:3000/api/commerce/webhook/payos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-provider-header': 'bounded' },
    body,
  });
}

const rawBody = JSON.stringify({ code: '00', success: true, data: {}, signature: 'signed' });
const event = {
  provider: 'payos' as const,
  providerEventId: 'tx-1',
  providerPaymentId: 'link-1',
  eventType: 'payment.succeeded',
  amountMinor: 50000,
  currency: 'VND' as const,
  occurredAt: '2026-09-25T00:01:00Z',
  payloadHash: 'a'.repeat(64),
  signedDataHash: 'b'.repeat(64),
  payload: JSON.parse(rawBody),
};

describe('POST /api/commerce/webhook/payos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.verifyWebhook.mockResolvedValue(event);
    mocks.rpc.mockResolvedValue({ data: [{ duplicate: false }], error: null });
  });

  it('verifies exact raw body before durable service-role enqueue', async () => {
    const response = await POST(request(rawBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.verifyWebhook).toHaveBeenCalledWith({
      rawBody,
      headers: expect.objectContaining({ 'x-provider-header': 'bounded' }),
    });
    expect(mocks.rpc).toHaveBeenCalledWith('commerce_enqueue_verified_payment_webhook', {
      p_provider: 'payos',
      p_provider_event_id: 'tx-1',
      p_provider_payment_id: 'link-1',
      p_event_type: 'payment.succeeded',
      p_amount_minor: 50000,
      p_currency: 'VND',
      p_payload_hash: 'a'.repeat(64),
      p_signed_data_hash: 'b'.repeat(64),
      p_payload: JSON.parse(rawBody),
      p_occurred_at: '2026-09-25T00:01:00.000Z',
    });
  });

  it('rejects invalid signature without writing untrusted payload', async () => {
    mocks.verifyWebhook.mockRejectedValueOnce(new Error('invalid signature'));
    const response = await POST(request(rawBody));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns retryable failure when durable enqueue fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'database_unavailable' } });
    const response = await POST(request(rawBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Chưa ghi nhận được webhook.' });
  });

  it('fails closed without service-role configuration', async () => {
    mocks.adminClient.mockReturnValueOnce(null);
    const response = await POST(request(rawBody));
    expect(response.status).toBe(503);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
  });

  it('rejects oversized payload before provider or database work', async () => {
    const response = await POST(request('x'.repeat(64 * 1024 + 1)));
    expect(response.status).toBe(413);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
