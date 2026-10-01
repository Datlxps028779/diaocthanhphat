import { createHash } from 'node:crypto';
import type { CommercePaymentProvider, CommerceProviderName, ProviderPayment } from '../commerceProvider';

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type ClaimedReconciliation = {
  reconciliation_job_id: string;
  processing_token: string;
  payment_attempt_id: string;
  provider: string;
  provider_payment_id: string;
  amount_minor: string | number;
  currency: string;
  attempt_number: number;
};

type CompletionRow = { outcome: string };

export type CommercePaymentReconciliationResult = {
  claimed: number;
  eventsEnqueued: number;
  stillPending: number;
  alreadyTerminal: number;
  leaseLost: number;
  retried: number;
  deadLettered: number;
};

export class CommercePaymentReconciliationError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommercePaymentReconciliationError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function integer(value: string | number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function claimRows(data: unknown): ClaimedReconciliation[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_CLAIM_INVALID_RESPONSE');
  return data.map(value => {
    if (!value || typeof value !== 'object') {
      throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_CLAIM_INVALID_RESPONSE');
    }
    const row = value as Partial<ClaimedReconciliation>;
    if (
      typeof row.reconciliation_job_id !== 'string'
      || !UUID.test(row.reconciliation_job_id)
      || typeof row.processing_token !== 'string'
      || !UUID.test(row.processing_token)
      || typeof row.payment_attempt_id !== 'string'
      || !UUID.test(row.payment_attempt_id)
      || typeof row.provider !== 'string'
      || typeof row.provider_payment_id !== 'string'
      || integer(row.amount_minor as string | number) == null
      || row.currency !== 'VND'
      || !Number.isInteger(row.attempt_number)
      || (row.attempt_number ?? 0) < 1
    ) {
      throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_CLAIM_INVALID_RESPONSE');
    }
    return row as ClaimedReconciliation;
  });
}

function completion(data: unknown): CompletionRow {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object' || typeof (value as CompletionRow).outcome !== 'string') {
    throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_COMPLETE_INVALID_RESPONSE');
  }
  return value as CompletionRow;
}

function retryable(error: RpcError): boolean {
  if (!error.code) return true;
  return /^PGRST00[0-3]$/.test(error.code)
    || error.code.startsWith('08')
    || error.code.startsWith('40')
    || error.code.startsWith('53')
    || error.code === '55P03'
    || error.code === '57014';
}

function lostLease(error: RpcError): boolean {
  return error.code === '42501'
    && error.message === 'Reconciliation claim is not owned by this worker.';
}

function lookupHash(payment: ProviderPayment): string {
  const canonical = JSON.stringify({
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    paidAt: payment.paidAt,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

async function failJob(input: {
  serviceClient: RpcClient;
  job: ClaimedReconciliation;
  errorCode: string;
  retryable: boolean;
}): Promise<'processed' | 'retry' | 'dead_letter' | 'lease_lost'> {
  const failure = await input.serviceClient.rpc('commerce_fail_payment_reconciliation', {
    p_reconciliation_job_id: input.job.reconciliation_job_id,
    p_processing_token: input.job.processing_token,
    p_error_code: input.errorCode,
    p_retryable: input.retryable,
  });
  if (failure.error) {
    if (lostLease(failure.error)) return 'lease_lost';
    throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_FAILURE_RECORD_FAILED', { cause: failure.error });
  }
  if (failure.data === 'processed' || failure.data === 'retry' || failure.data === 'dead_letter') return failure.data;
  throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_FAILURE_INVALID_RESPONSE');
}

export async function reconcileCommercePayments(input: {
  serviceClient: RpcClient;
  providers: Partial<Record<CommerceProviderName, CommercePaymentProvider>>;
  limit?: number;
  now?: () => Date;
}): Promise<CommercePaymentReconciliationResult> {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_LIMIT_INVALID');
  }

  const claim = await input.serviceClient.rpc('commerce_claim_payment_reconciliations', { p_limit: limit });
  if (claim.error) {
    throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_CLAIM_FAILED', { cause: claim.error });
  }

  const jobs = claimRows(claim.data);
  const result: CommercePaymentReconciliationResult = {
    claimed: jobs.length,
    eventsEnqueued: 0,
    stillPending: 0,
    alreadyTerminal: 0,
    leaseLost: 0,
    retried: 0,
    deadLettered: 0,
  };

  for (const job of jobs) {
    const provider = input.providers[job.provider as CommerceProviderName];
    if (!provider || provider.name !== job.provider || !provider.capabilities.paymentStatusLookup) {
      const outcome = await failJob({
        serviceClient: input.serviceClient,
        job,
        errorCode: 'provider_lookup_unsupported',
        retryable: false,
      });
      if (outcome === 'processed') result.alreadyTerminal += 1;
      else if (outcome === 'lease_lost') result.leaseLost += 1;
      else result.deadLettered += 1;
      continue;
    }

    let payment: ProviderPayment;
    try {
      payment = await provider.getPayment(job.provider_payment_id);
    } catch {
      const outcome = await failJob({
        serviceClient: input.serviceClient,
        job,
        errorCode: 'provider_lookup_failed',
        retryable: true,
      });
      if (outcome === 'processed') result.alreadyTerminal += 1;
      else if (outcome === 'lease_lost') result.leaseLost += 1;
      else if (outcome === 'retry') result.retried += 1;
      else result.deadLettered += 1;
      continue;
    }

    const amountMinor = integer(payment.amountMinor);
    if (
      payment.provider !== provider.name
      || payment.providerPaymentId !== job.provider_payment_id
      || amountMinor == null
      || payment.currency !== 'VND'
    ) {
      const outcome = await failJob({
        serviceClient: input.serviceClient,
        job,
        errorCode: 'provider_lookup_response_mismatch',
        retryable: false,
      });
      if (outcome === 'processed') result.alreadyTerminal += 1;
      else if (outcome === 'lease_lost') result.leaseLost += 1;
      else result.deadLettered += 1;
      continue;
    }

    const observedAt = (input.now?.() ?? new Date()).toISOString();
    const completed = await input.serviceClient.rpc('commerce_complete_payment_reconciliation', {
      p_reconciliation_job_id: job.reconciliation_job_id,
      p_processing_token: job.processing_token,
      p_provider_payment_id: payment.providerPaymentId,
      p_provider_status: payment.status,
      p_amount_minor: amountMinor,
      p_currency: payment.currency,
      p_provider_lookup_hash: lookupHash(payment),
      p_paid_at: payment.paidAt,
      p_observed_at: observedAt,
    });

    if (completed.error) {
      if (lostLease(completed.error)) {
        result.leaseLost += 1;
        continue;
      }
      const code = completed.error.code && /^[A-Za-z0-9_:-]{2,80}$/.test(completed.error.code)
        ? completed.error.code
        : 'reconciliation_rpc_error';
      const outcome = await failJob({
        serviceClient: input.serviceClient,
        job,
        errorCode: code,
        retryable: retryable(completed.error),
      });
      if (outcome === 'processed') result.alreadyTerminal += 1;
      else if (outcome === 'lease_lost') result.leaseLost += 1;
      else if (outcome === 'retry') result.retried += 1;
      else result.deadLettered += 1;
      continue;
    }

    const { outcome } = completion(completed.data);
    if (outcome === 'event_enqueued') result.eventsEnqueued += 1;
    else if (outcome === 'retry') result.stillPending += 1;
    else if (outcome === 'dead_letter') result.deadLettered += 1;
    else if (outcome === 'attempt_terminal' || outcome === 'already_processed') result.alreadyTerminal += 1;
    else throw new CommercePaymentReconciliationError('COMMERCE_RECONCILIATION_OUTCOME_INVALID');
  }

  return result;
}
