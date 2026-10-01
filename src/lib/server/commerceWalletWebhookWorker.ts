import type { CommercePaymentProvider, CommerceProviderName, ProviderPayment } from '../commerceProvider';
import { createHash } from 'node:crypto';

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type ClaimedWalletWebhook = {
  webhook_inbox_id: string;
  processing_token: string;
  provider: string;
  provider_event_id: string;
  attempt_number: number;
};

type ClaimedWalletReconciliation = {
  reconciliation_job_id: string;
  processing_token: string;
  topup_checkout_id: string;
  provider: string;
  provider_payment_id: string;
  amount_minor: string | number;
  currency: string;
  attempt_number: number;
};

export type CommerceWalletWebhookWorkerResult = {
  claimed: number;
  processed: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
};

export type CommerceWalletReconciliationResult = {
  claimed: number;
  eventsEnqueued: number;
  stillPending: number;
  alreadyTerminal: number;
  leaseLost: number;
  retried: number;
  deadLettered: number;
};

export class CommerceWalletWebhookWorkerError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommerceWalletWebhookWorkerError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rows<T>(data: unknown, code: string): T[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new CommerceWalletWebhookWorkerError(code);
  return data as T[];
}

function claimedWebhookRows(data: unknown): ClaimedWalletWebhook[] {
  return rows<ClaimedWalletWebhook>(data, 'COMMERCE_WALLET_WEBHOOK_CLAIM_INVALID_RESPONSE').map(row => {
    if (
      typeof row.webhook_inbox_id !== 'string' || !UUID.test(row.webhook_inbox_id)
      || typeof row.processing_token !== 'string' || !UUID.test(row.processing_token)
      || typeof row.provider !== 'string' || typeof row.provider_event_id !== 'string'
      || !Number.isInteger(row.attempt_number) || row.attempt_number < 1
    ) throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_WEBHOOK_CLAIM_INVALID_RESPONSE');
    return row;
  });
}

function retryable(error: RpcError): boolean {
  if (!error.code) return true;
  return error.code === 'P0002'
    || /^PGRST00[0-3]$/.test(error.code)
    || error.code.startsWith('08')
    || error.code.startsWith('40')
    || error.code.startsWith('53')
    || error.code === '55P03'
    || error.code === '57014';
}

function failureCode(error: RpcError): string {
  return error.code && /^[A-Za-z0-9_:-]{2,80}$/.test(error.code) ? error.code : 'rpc_error';
}

function lostWebhookLease(error: RpcError): boolean {
  return error.code === '42501'
    && error.message === 'Webhook claim is not owned by this worker.';
}

async function failWebhook(input: {
  serviceClient: RpcClient;
  job: ClaimedWalletWebhook;
  error: RpcError;
}): Promise<'retry' | 'dead_letter' | 'processed' | 'lease_lost'> {
  const failed = await input.serviceClient.rpc('commerce_fail_payment_webhook', {
    p_webhook_inbox_id: input.job.webhook_inbox_id,
    p_processing_token: input.job.processing_token,
    p_error_code: failureCode(input.error),
    p_retryable: retryable(input.error),
  });
  if (failed.error) {
    if (lostWebhookLease(failed.error)) return 'lease_lost';
    throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_WEBHOOK_FAILURE_RECORD_FAILED', { cause: failed.error });
  }
  if (failed.data === 'retry' || failed.data === 'dead_letter' || failed.data === 'processed') return failed.data;
  throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_WEBHOOK_FAILURE_INVALID_RESPONSE');
}

export async function processCommerceWalletPaymentWebhooks(input: {
  serviceClient: RpcClient;
  limit?: number;
}): Promise<CommerceWalletWebhookWorkerResult> {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_WEBHOOK_LIMIT_INVALID');

  const claim = await input.serviceClient.rpc('commerce_claim_wallet_payment_webhooks', { p_limit: limit });
  if (claim.error) throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_WEBHOOK_CLAIM_FAILED', { cause: claim.error });
  const jobs = claimedWebhookRows(claim.data);
  const result = { claimed: jobs.length, processed: 0, retried: 0, deadLettered: 0, leaseLost: 0 };

  for (const job of jobs) {
    const processed = await input.serviceClient.rpc('commerce_process_wallet_payment_webhook', {
      p_webhook_inbox_id: job.webhook_inbox_id,
      p_processing_token: job.processing_token,
    });
    if (!processed.error) {
      result.processed += 1;
      continue;
    }
    const outcome = await failWebhook({ serviceClient: input.serviceClient, job, error: processed.error });
    if (outcome === 'retry') result.retried += 1;
    else if (outcome === 'dead_letter') result.deadLettered += 1;
    else if (outcome === 'lease_lost') result.leaseLost += 1;
    else result.processed += 1;
  }
  return result;
}

function claimedReconciliationRows(data: unknown): ClaimedWalletReconciliation[] {
  return rows<ClaimedWalletReconciliation>(data, 'COMMERCE_WALLET_RECONCILIATION_CLAIM_INVALID_RESPONSE').map(row => {
    const amount = typeof row.amount_minor === 'number' ? row.amount_minor : Number(row.amount_minor);
    if (
      typeof row.reconciliation_job_id !== 'string' || !UUID.test(row.reconciliation_job_id)
      || typeof row.processing_token !== 'string' || !UUID.test(row.processing_token)
      || typeof row.topup_checkout_id !== 'string' || !UUID.test(row.topup_checkout_id)
      || typeof row.provider !== 'string' || typeof row.provider_payment_id !== 'string'
      || !Number.isSafeInteger(amount) || amount < 1 || row.currency !== 'VND'
      || !Number.isInteger(row.attempt_number) || row.attempt_number < 1
    ) throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_RECONCILIATION_CLAIM_INVALID_RESPONSE');
    return row;
  });
}

function lookupHash(payment: ProviderPayment): string {
  return createHash('sha256').update(JSON.stringify({
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    paidAt: payment.paidAt,
  })).digest('hex');
}

export async function reconcileCommerceWalletTopups(input: {
  serviceClient: RpcClient;
  providers: Partial<Record<CommerceProviderName, CommercePaymentProvider>>;
  limit?: number;
  now?: () => Date;
}): Promise<CommerceWalletReconciliationResult> {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_RECONCILIATION_LIMIT_INVALID');
  const claim = await input.serviceClient.rpc('commerce_claim_wallet_topup_reconciliations', { p_limit: limit });
  if (claim.error) throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_RECONCILIATION_CLAIM_FAILED', { cause: claim.error });

  const jobs = claimedReconciliationRows(claim.data);
  const result = { claimed: jobs.length, eventsEnqueued: 0, stillPending: 0, alreadyTerminal: 0, retried: 0, deadLettered: 0, leaseLost: 0 };
  const recordFailure = (outcome: 'retry' | 'dead_letter' | 'processed' | 'lease_lost') => {
    if (outcome === 'retry') result.retried += 1;
    else if (outcome === 'dead_letter') result.deadLettered += 1;
    else if (outcome === 'lease_lost') result.leaseLost += 1;
    else result.alreadyTerminal += 1;
  };  for (const job of jobs) {
    const provider = input.providers[job.provider as CommerceProviderName];
    const fail = async (code: string, canRetry: boolean): Promise<'retry' | 'dead_letter' | 'processed' | 'lease_lost'> => {
      const response = await input.serviceClient.rpc('commerce_fail_wallet_topup_reconciliation', {
        p_reconciliation_job_id: job.reconciliation_job_id,
        p_processing_token: job.processing_token,
        p_error_code: code,
        p_retryable: canRetry,
      });
      if (response.error) {
        if (response.error.code === '42501' && response.error.message === 'Wallet reconciliation claim is not owned by this worker.') {
          return 'lease_lost';
        }
        throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_RECONCILIATION_FAILURE_RECORD_FAILED', { cause: response.error });
      }
      if (response.data === 'retry' || response.data === 'dead_letter' || response.data === 'processed') return response.data;
      throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_RECONCILIATION_FAILURE_INVALID_RESPONSE');
    };
    if (!provider || provider.name !== job.provider || !provider.capabilities.paymentStatusLookup) {
      recordFailure(await fail('provider_lookup_unsupported', false));
      continue;
    }
    let payment: ProviderPayment;
    try {
      payment = await provider.getPayment(job.provider_payment_id);
    } catch {
      recordFailure(await fail('provider_lookup_failed', true));
      continue;
    }
    const amount = typeof payment.amountMinor === 'number' ? payment.amountMinor : Number(payment.amountMinor);
    if (payment.provider !== provider.name || payment.providerPaymentId !== job.provider_payment_id
      || !Number.isSafeInteger(amount) || amount < 0 || payment.currency !== 'VND') {
      recordFailure(await fail('provider_lookup_response_mismatch', false));
      continue;
    }
    const completed = await input.serviceClient.rpc('commerce_complete_wallet_topup_reconciliation', {
      p_reconciliation_job_id: job.reconciliation_job_id,
      p_processing_token: job.processing_token,
      p_provider_payment_id: payment.providerPaymentId,
      p_provider_status: payment.status,
      p_amount_minor: amount,
      p_currency: payment.currency,
      p_provider_lookup_hash: lookupHash(payment),
      p_paid_at: payment.paidAt,
      p_observed_at: (input.now?.() ?? new Date()).toISOString(),
    });
    if (completed.error) {
      if (completed.error.code === '42501' && completed.error.message === 'Wallet reconciliation claim is not owned by this worker.') {
        result.leaseLost += 1;
        continue;
      }
      recordFailure(await fail(completed.error.code && /^[A-Za-z0-9_:-]{2,80}$/.test(completed.error.code) ? completed.error.code : 'reconciliation_rpc_error', retryable(completed.error)));
      continue;
    }
    const row = Array.isArray(completed.data) ? completed.data[0] : completed.data;
    const outcome = row && typeof row === 'object' && 'outcome' in row ? String((row as { outcome: unknown }).outcome) : '';
    if (outcome === 'event_enqueued') result.eventsEnqueued += 1;
    else if (outcome === 'retry') result.stillPending += 1;
    else if (outcome === 'already_processed' || outcome === 'attempt_terminal') result.alreadyTerminal += 1;
    else if (outcome === 'dead_letter') result.deadLettered += 1;
    else throw new CommerceWalletWebhookWorkerError('COMMERCE_WALLET_RECONCILIATION_OUTCOME_INVALID');
  }
  return result;
}
