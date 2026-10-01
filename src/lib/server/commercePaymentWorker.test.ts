import { describe, expect, it, vi } from 'vitest';
import { CommercePaymentWorkerError, processCommercePaymentWebhooks } from './commercePaymentWorker';

const inboxId = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';

function client(responses: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  return {
    rpc: vi.fn(async () => responses.shift() ?? { data: null, error: null }),
  };
}

const claim = [{
  webhook_inbox_id: inboxId,
  processing_token: token,
  provider: 'payos',
  provider_event_id: 'tx-1',
  attempt_number: 1,
}];

describe('commerce payment worker', () => {
  it('claims a bounded batch and processes each leased inbox row', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: [{ outcome: 'payment_succeeded' }], error: null },
    ]);

    await expect(processCommercePaymentWebhooks({ serviceClient, limit: 5 })).resolves.toEqual({
      claimed: 1,
      processed: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(1, 'commerce_claim_payment_webhooks', { p_limit: 5 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_process_payment_webhook', {
      p_webhook_inbox_id: inboxId,
      p_processing_token: token,
    });
  });

  it('schedules transient database and orphan-linkage failures for retry', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: 'P0002', message: 'Payment event is not attached' } },
      { data: 'retry', error: null },
    ]);

    await expect(processCommercePaymentWebhooks({ serviceClient })).resolves.toEqual({
      claimed: 1,
      processed: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_webhook', {
      p_webhook_inbox_id: inboxId,
      p_processing_token: token,
      p_error_code: 'P0002',
      p_retryable: true,
    });
  });

  it('retries transient PostgREST connection failures', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: 'PGRST003', message: 'connection pool timeout' } },
      { data: 'retry', error: null },
    ]);

    await processCommercePaymentWebhooks({ serviceClient });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_webhook', expect.objectContaining({
      p_error_code: 'PGRST003',
      p_retryable: true,
    }));
  });

  it('dead-letters deterministic amount or invariant failures', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: '22023', message: 'Payment amount mismatch' } },
      { data: 'dead_letter', error: null },
    ]);

    await expect(processCommercePaymentWebhooks({ serviceClient })).resolves.toMatchObject({
      deadLettered: 1,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_webhook', expect.objectContaining({
      p_error_code: '22023',
      p_retryable: false,
    }));
  });

  it('treats unknown transport failures as retryable without persisting raw messages', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { message: 'socket details must not enter the ledger' } },
      { data: 'retry', error: null },
    ]);

    await processCommercePaymentWebhooks({ serviceClient });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_webhook', expect.objectContaining({
      p_error_code: 'rpc_error',
      p_retryable: true,
    }));
  });

  it('retries PostgreSQL connection-class failures', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: '08006', message: 'connection failure' } },
      { data: 'retry', error: null },
    ]);

    await processCommercePaymentWebhooks({ serviceClient });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_webhook', expect.objectContaining({
      p_error_code: '08006',
      p_retryable: true,
    }));
  });

  it('rejects invalid limits, malformed claims and failure-recording loss', async () => {
    const serviceClient = client([]);
    await expect(processCommercePaymentWebhooks({ serviceClient, limit: 0 })).rejects.toMatchObject({
      code: 'COMMERCE_WEBHOOK_LIMIT_INVALID',
    });

    const malformed = client([{ data: [{ processing_token: token }], error: null }]);
    await expect(processCommercePaymentWebhooks({ serviceClient: malformed })).rejects.toBeInstanceOf(CommercePaymentWorkerError);

    const lostFailure = client([
      { data: claim, error: null },
      { data: null, error: { code: '40001' } },
      { data: null, error: { code: '08006' } },
    ]);
    await expect(processCommercePaymentWebhooks({ serviceClient: lostFailure })).rejects.toMatchObject({
      code: 'COMMERCE_WEBHOOK_FAILURE_RECORD_FAILED',
    });
  });
});
