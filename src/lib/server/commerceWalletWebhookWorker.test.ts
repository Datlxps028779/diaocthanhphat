import { describe, expect, it, vi } from 'vitest';
import { PAYOS_CAPABILITIES, type CommercePaymentProvider } from '../commerceProvider';
import {
  processCommerceWalletPaymentWebhooks,
  reconcileCommerceWalletTopups,
} from './commerceWalletWebhookWorker';

const inboxId = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const checkoutId = '44444444-4444-4444-8444-444444444444';

function client(responses: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  return { rpc: vi.fn(async () => responses.shift() ?? { data: null, error: null }) };
}

function provider(): CommercePaymentProvider {
  return {
    name: 'payos',
    capabilities: PAYOS_CAPABILITIES,
    createCheckout: vi.fn(),
    verifyWebhook: vi.fn(),
    getPayment: vi.fn(async () => ({
      provider: 'payos' as const,
      providerPaymentId: 'wallet-payment-1',
      status: 'succeeded' as const,
      amountMinor: 250000,
      currency: 'VND' as const,
      paidAt: '2026-09-29T08:00:00.000Z',
    })),
  };
}

const webhookJob = {
  webhook_inbox_id: inboxId,
  processing_token: token,
  provider: 'payos',
  provider_event_id: 'wallet-event-1',
  attempt_number: 1,
};

const reconciliationJob = {
  reconciliation_job_id: jobId,
  processing_token: token,
  topup_checkout_id: checkoutId,
  provider: 'payos',
  provider_payment_id: 'wallet-payment-1',
  amount_minor: 250000,
  currency: 'VND',
  attempt_number: 1,
};

describe('commerce Wallet webhook worker', () => {
  it('claims and processes only the Wallet webhook batch', async () => {
    const serviceClient = client([
      { data: [webhookJob], error: null },
      { data: [{ outcome: 'topup_credited', topup_checkout_id: checkoutId }], error: null },
    ]);

    await expect(processCommerceWalletPaymentWebhooks({ serviceClient, limit: 5 })).resolves.toEqual({
      claimed: 1,
      processed: 1,
      retried: 0,
      deadLettered: 0,
      leaseLost: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(1, 'commerce_claim_wallet_payment_webhooks', { p_limit: 5 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_process_wallet_payment_webhook', {
      p_webhook_inbox_id: inboxId,
      p_processing_token: token,
    });
  });

  it('dead-letters deterministic Wallet mismatch without leaking provider text', async () => {
    const serviceClient = client([
      { data: [webhookJob], error: null },
      { data: null, error: { code: '22023', message: 'amount mismatch' } },
      { data: 'dead_letter', error: null },
    ]);

    await expect(processCommerceWalletPaymentWebhooks({ serviceClient })).resolves.toMatchObject({
      deadLettered: 1,
      leaseLost: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_webhook', expect.objectContaining({
      p_error_code: '22023',
      p_retryable: false,
    }));
  });

  it('continues the webhook batch when a claimed lease is lost', async () => {
    const serviceClient = client([
      { data: [webhookJob, { ...webhookJob, webhook_inbox_id: jobId, provider_event_id: 'wallet-event-2' }], error: null },
      { data: null, error: { code: '42501', message: 'Webhook claim is not owned by this worker.' } },
      { data: null, error: { code: '42501', message: 'Webhook claim is not owned by this worker.' } },
      { data: [{ outcome: 'topup_credited' }], error: null },
    ]);

    await expect(processCommerceWalletPaymentWebhooks({ serviceClient })).resolves.toEqual({
      claimed: 2,
      processed: 1,
      retried: 0,
      deadLettered: 0,
      leaseLost: 1,
    });
    expect(serviceClient.rpc).toHaveBeenLastCalledWith('commerce_process_wallet_payment_webhook', {
      p_webhook_inbox_id: jobId,
      p_processing_token: token,
    });
  });
});

describe('commerce Wallet reconciliation worker', () => {
  it('looks up provider status and enqueues a verified Wallet event', async () => {
    const serviceClient = client([
      { data: [reconciliationJob], error: null },
      { data: [{ outcome: 'event_enqueued' }], error: null },
    ]);

    await expect(reconcileCommerceWalletTopups({
      serviceClient,
      providers: { payos: provider() },
      now: () => new Date('2026-09-29T08:01:00.000Z'),
    })).resolves.toEqual({
      claimed: 1,
      eventsEnqueued: 1,
      stillPending: 0,
      alreadyTerminal: 0,
      leaseLost: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(1, 'commerce_claim_wallet_topup_reconciliations', { p_limit: 10 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_complete_wallet_topup_reconciliation', expect.objectContaining({
      p_reconciliation_job_id: jobId,
      p_provider_payment_id: 'wallet-payment-1',
      p_amount_minor: 250000,
      p_currency: 'VND',
      p_observed_at: '2026-09-29T08:01:00.000Z',
    }));
  });

  it('retries provider lookup failures', async () => {
    const payos = provider();
    vi.mocked(payos.getPayment).mockRejectedValueOnce(new Error('provider unavailable'));
    const serviceClient = client([
      { data: [reconciliationJob], error: null },
      { data: 'retry', error: null },
    ]);

    await expect(reconcileCommerceWalletTopups({ serviceClient, providers: { payos }, limit: 1 })).resolves.toMatchObject({
      retried: 1,
      leaseLost: 0,
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_fail_wallet_topup_reconciliation', expect.objectContaining({
      p_reconciliation_job_id: jobId,
      p_error_code: 'provider_lookup_failed',
      p_retryable: true,
    }));
  });

  it('continues reconciliation when a claimed lease is lost', async () => {
    const serviceClient = client([
      { data: [reconciliationJob, { ...reconciliationJob, reconciliation_job_id: inboxId }], error: null },
      { data: null, error: { code: '42501', message: 'Wallet reconciliation claim is not owned by this worker.' } },
      { data: [{ outcome: 'event_enqueued' }], error: null },
    ]);

    await expect(reconcileCommerceWalletTopups({ serviceClient, providers: { payos: provider() } })).resolves.toEqual({
      claimed: 2,
      eventsEnqueued: 1,
      stillPending: 0,
      alreadyTerminal: 0,
      leaseLost: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(serviceClient.rpc).toHaveBeenLastCalledWith('commerce_complete_wallet_topup_reconciliation', expect.objectContaining({
      p_reconciliation_job_id: inboxId,
    }));
  });

  it('does not hide unrelated permission errors as a lost lease', async () => {
    const serviceClient = client([
      { data: [reconciliationJob], error: null },
      { data: null, error: { code: '42501', message: 'Service role required.' } },
      { data: null, error: { code: '42501', message: 'Service role required.' } },
    ]);

    await expect(reconcileCommerceWalletTopups({ serviceClient, providers: { payos: provider() } }))
      .rejects.toThrow('COMMERCE_WALLET_RECONCILIATION_FAILURE_RECORD_FAILED');
  });

  it('rejects unknown failure outcomes rather than counting them as terminal', async () => {
    const serviceClient = client([
      { data: [reconciliationJob], error: null },
      { data: null, error: null },
    ]);

    await expect(reconcileCommerceWalletTopups({ serviceClient, providers: {} }))
      .rejects.toThrow('COMMERCE_WALLET_RECONCILIATION_FAILURE_INVALID_RESPONSE');
  });
});
