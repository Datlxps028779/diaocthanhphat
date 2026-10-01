import { describe, expect, it, vi } from 'vitest';
import type { CommercePaymentProvider, ProviderPayment } from '../commerceProvider';
import { reconcileCommercePayments } from './commercePaymentReconciliation';

const jobId = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const observedAt = new Date('2026-09-25T12:00:00.000Z');

const claim = [{
  reconciliation_job_id: jobId,
  processing_token: token,
  payment_attempt_id: attemptId,
  provider: 'payos',
  provider_payment_id: 'link-1',
  amount_minor: 50000,
  currency: 'VND',
  attempt_number: 1,
}];

function client(responses: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  return {
    rpc: vi.fn(async (_name: string, _params: Record<string, unknown>) => (
      responses.shift() ?? { data: null, error: null }
    )),
  };
}

function provider(overrides: Partial<Awaited<ReturnType<CommercePaymentProvider['getPayment']>>> = {}): CommercePaymentProvider {
  return {
    name: 'payos',
    capabilities: {
      hostedCheckout: true,
      signedWebhook: true,
      paymentStatusLookup: true,
      invoiceLookup: true,
      dedicatedSandbox: false,
      documentedRefundApi: false,
      documentedAutomaticRecurring: false,
    },
    createCheckout: vi.fn(),
    verifyWebhook: vi.fn(),
    getPayment: vi.fn(async (): Promise<ProviderPayment> => ({
      provider: 'payos',
      providerPaymentId: 'link-1',
      status: 'succeeded',
      amountMinor: 50000,
      currency: 'VND',
      paidAt: '2026-09-25T11:59:00.000Z',
      ...overrides,
    })),
  };
}

describe('commerce payment reconciliation worker', () => {
  it('turns a successful provider lookup into a durable inbox event', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: [{ outcome: 'event_enqueued' }], error: null },
    ]);
    const payos = provider();

    await expect(reconcileCommercePayments({
      serviceClient,
      providers: { payos },
      now: () => observedAt,
    })).resolves.toEqual({
      claimed: 1,
      eventsEnqueued: 1,
      stillPending: 0,
      alreadyTerminal: 0,
      leaseLost: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(payos.getPayment).toHaveBeenCalledWith('link-1');
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_complete_payment_reconciliation', {
      p_reconciliation_job_id: jobId,
      p_processing_token: token,
      p_provider_payment_id: 'link-1',
      p_provider_status: 'succeeded',
      p_amount_minor: 50000,
      p_currency: 'VND',
      p_provider_lookup_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_paid_at: '2026-09-25T11:59:00.000Z',
      p_observed_at: observedAt.toISOString(),
    });
  });

  it('keeps provider lookup fingerprint stable across observation times', async () => {
    const firstClient = client([
      { data: claim, error: null },
      { data: [{ outcome: 'event_enqueued' }], error: null },
    ]);
    const secondClient = client([
      { data: claim, error: null },
      { data: [{ outcome: 'event_enqueued' }], error: null },
    ]);
    const payos = provider();

    await reconcileCommercePayments({ serviceClient: firstClient, providers: { payos }, now: () => observedAt });
    await reconcileCommercePayments({
      serviceClient: secondClient,
      providers: { payos },
      now: () => new Date('2026-09-25T12:05:00.000Z'),
    });

    const firstHash = firstClient.rpc.mock.calls[1]?.[1].p_provider_lookup_hash;
    const secondHash = secondClient.rpc.mock.calls[1]?.[1].p_provider_lookup_hash;
    expect(firstHash).toBe(secondHash);
  });

  it('reschedules a provider payment that is still pending', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: [{ outcome: 'retry' }], error: null },
    ]);

    await expect(reconcileCommercePayments({
      serviceClient,
      providers: { payos: provider({ status: 'pending', paidAt: null }) },
      now: () => observedAt,
    })).resolves.toMatchObject({ stillPending: 1 });
  });

  it('retries provider transport failures without persisting raw errors', async () => {
    const payos = provider();
    vi.mocked(payos.getPayment).mockRejectedValueOnce(new Error('socket and credential details'));
    const serviceClient = client([
      { data: claim, error: null },
      { data: 'retry', error: null },
    ]);

    await expect(reconcileCommercePayments({ serviceClient, providers: { payos } })).resolves.toMatchObject({ retried: 1 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_fail_payment_reconciliation', {
      p_reconciliation_job_id: jobId,
      p_processing_token: token,
      p_error_code: 'provider_lookup_failed',
      p_retryable: true,
    });
  });

  it('dead-letters provider identity drift and unsupported providers', async () => {
    const mismatchClient = client([
      { data: claim, error: null },
      { data: 'dead_letter', error: null },
    ]);
    await reconcileCommercePayments({
      serviceClient: mismatchClient,
      providers: { payos: provider({ providerPaymentId: 'other-link' }) },
    });
    expect(mismatchClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_fail_payment_reconciliation', expect.objectContaining({
      p_error_code: 'provider_lookup_response_mismatch',
      p_retryable: false,
    }));

    const unsupportedClient = client([
      { data: [{ ...claim[0], provider: 'unknown' }], error: null },
      { data: 'dead_letter', error: null },
    ]);
    await expect(reconcileCommercePayments({
      serviceClient: unsupportedClient,
      providers: { payos: provider() },
    })).resolves.toMatchObject({ deadLettered: 1 });
  });

  it('skips stale leases without aborting the remaining batch', async () => {
    const secondJob = {
      ...claim[0],
      reconciliation_job_id: '44444444-4444-4444-8444-444444444444',
      processing_token: '55555555-5555-4555-8555-555555555555',
      payment_attempt_id: '66666666-6666-4666-8666-666666666666',
      provider_payment_id: 'link-2',
    };
    const payos = provider();
    vi.mocked(payos.getPayment)
      .mockResolvedValueOnce({
        provider: 'payos', providerPaymentId: 'link-1', status: 'succeeded',
        amountMinor: 50000, currency: 'VND', paidAt: '2026-09-25T11:59:00.000Z',
      })
      .mockResolvedValueOnce({
        provider: 'payos', providerPaymentId: 'link-2', status: 'succeeded',
        amountMinor: 50000, currency: 'VND', paidAt: '2026-09-25T11:59:00.000Z',
      });
    const serviceClient = client([
      { data: [claim[0], secondJob], error: null },
      { data: null, error: { code: '42501', message: 'Reconciliation claim is not owned by this worker.' } },
      { data: [{ outcome: 'event_enqueued' }], error: null },
    ]);

    await expect(reconcileCommercePayments({ serviceClient, providers: { payos } })).resolves.toMatchObject({
      claimed: 2,
      leaseLost: 1,
      eventsEnqueued: 1,
    });
    expect(serviceClient.rpc).toHaveBeenCalledTimes(3);
  });

  it('treats lease loss while recording a failure as a skipped job', async () => {
    const payos = provider();
    vi.mocked(payos.getPayment).mockRejectedValueOnce(new Error('timeout'));
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: '42501', message: 'Reconciliation claim is not owned by this worker.' } },
    ]);

    await expect(reconcileCommercePayments({ serviceClient, providers: { payos } })).resolves.toMatchObject({
      leaseLost: 1,
      retried: 0,
      deadLettered: 0,
    });
  });

  it('retries transient PostgREST connection failures', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: 'PGRST003', message: 'connection pool timeout' } },
      { data: 'retry', error: null },
    ]);

    await reconcileCommercePayments({ serviceClient, providers: { payos: provider() } });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_reconciliation', expect.objectContaining({
      p_error_code: 'PGRST003',
      p_retryable: true,
    }));
  });

  it('classifies deterministic RPC mismatch as dead-letter', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: '22023', message: 'amount mismatch' } },
      { data: 'dead_letter', error: null },
    ]);

    await reconcileCommercePayments({ serviceClient, providers: { payos: provider() } });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_payment_reconciliation', expect.objectContaining({
      p_error_code: '22023',
      p_retryable: false,
    }));
  });
});
