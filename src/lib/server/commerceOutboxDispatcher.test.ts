import { describe, expect, it, vi } from 'vitest';
import { dispatchCommerceOutbox } from './commerceOutboxDispatcher';

const outboxId = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const aggregateId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';

const claim = [{
  outbox_id: outboxId,
  processing_token: token,
  topic: 'commerce.order.paid',
  aggregate_type: 'order',
  aggregate_id: aggregateId,
  attempt_number: 1,
}];

function client(responses: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  return {
    rpc: vi.fn(async (_name: string, _params: Record<string, unknown>) => (
      responses.shift() ?? { data: null, error: null }
    )),
  };
}

describe('commerce outbox dispatcher', () => {
  it('claims and delivers a concrete destination', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: [{ outcome: 'sent', destination_type: 'owner_notification', destination_id: destinationId }], error: null },
    ]);

    await expect(dispatchCommerceOutbox({ serviceClient, limit: 5 })).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      retried: 0,
      deadLettered: 0,
      leaseLost: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(1, 'commerce_claim_outbox', { p_limit: 5 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_deliver_outbox', {
      p_outbox_id: outboxId,
      p_processing_token: token,
    });
  });

  it('schedules transient database failures for retry', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: 'PGRST003', message: 'connection pool timeout' } },
      { data: 'retry', error: null },
    ]);

    await expect(dispatchCommerceOutbox({ serviceClient })).resolves.toMatchObject({ retried: 1 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_outbox', {
      p_outbox_id: outboxId,
      p_processing_token: token,
      p_error_code: 'PGRST003',
      p_retryable: true,
    });
  });

  it('dead-letters unsupported topics and other deterministic failures', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: 'P0001', message: 'unsupported topic' } },
      { data: 'dead_letter', error: null },
    ]);

    await expect(dispatchCommerceOutbox({ serviceClient })).resolves.toMatchObject({ deadLettered: 1 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_outbox', expect.objectContaining({
      p_error_code: 'P0001',
      p_retryable: false,
    }));
  });

  it('skips a stale lease and continues delivering the rest of the batch', async () => {
    const second = {
      ...claim[0],
      outbox_id: '55555555-5555-4555-8555-555555555555',
      processing_token: '66666666-6666-4666-8666-666666666666',
      aggregate_id: '77777777-7777-4777-8777-777777777777',
    };
    const serviceClient = client([
      { data: [claim[0], second], error: null },
      { data: null, error: { code: '42501', message: 'Outbox claim is not owned by this worker.' } },
      { data: [{ outcome: 'sent', destination_type: 'owner_notification', destination_id: destinationId }], error: null },
    ]);

    await expect(dispatchCommerceOutbox({ serviceClient })).resolves.toMatchObject({
      claimed: 2,
      delivered: 1,
      leaseLost: 1,
    });
    expect(serviceClient.rpc).toHaveBeenCalledTimes(3);
  });

  it('handles lease loss while recording a failed delivery', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: '08006', message: 'connection failure' } },
      { data: null, error: { code: '42501', message: 'Outbox claim is not owned by this worker.' } },
    ]);

    await expect(dispatchCommerceOutbox({ serviceClient })).resolves.toMatchObject({ leaseLost: 1 });
  });

  it('rejects malformed claims and invalid delivery responses', async () => {
    const malformedClaim = client([{ data: [{ outbox_id: outboxId }], error: null }]);
    await expect(dispatchCommerceOutbox({ serviceClient: malformedClaim })).rejects.toMatchObject({
      code: 'COMMERCE_OUTBOX_CLAIM_INVALID_RESPONSE',
    });

    const malformedDelivery = client([
      { data: claim, error: null },
      { data: [{ outcome: 'sent', destination_type: 'owner_notification', destination_id: null }], error: null },
    ]);
    await expect(dispatchCommerceOutbox({ serviceClient: malformedDelivery })).rejects.toMatchObject({
      code: 'COMMERCE_OUTBOX_DELIVERY_INVALID_RESPONSE',
    });
  });
});
