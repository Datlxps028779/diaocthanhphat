type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type ClaimedWebhook = {
  webhook_inbox_id: string;
  processing_token: string;
  provider: string;
  provider_event_id: string;
  attempt_number: number;
};

export type CommercePaymentWorkerResult = {
  claimed: number;
  processed: number;
  retried: number;
  deadLettered: number;
};

export class CommercePaymentWorkerError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommercePaymentWorkerError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function rows(data: unknown): ClaimedWebhook[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_CLAIM_INVALID_RESPONSE');
  return data.map(value => {
    if (!value || typeof value !== 'object') {
      throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_CLAIM_INVALID_RESPONSE');
    }
    const row = value as Partial<ClaimedWebhook>;
    if (
      typeof row.webhook_inbox_id !== 'string'
      || !UUID.test(row.webhook_inbox_id)
      || typeof row.processing_token !== 'string'
      || !UUID.test(row.processing_token)
      || typeof row.provider !== 'string'
      || typeof row.provider_event_id !== 'string'
      || !Number.isInteger(row.attempt_number)
      || (row.attempt_number ?? 0) < 1
    ) {
      throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_CLAIM_INVALID_RESPONSE');
    }
    return row as ClaimedWebhook;
  });
}

function failureCode(error: RpcError): string {
  return error.code && /^[A-Za-z0-9_:-]{2,80}$/.test(error.code) ? error.code : 'rpc_error';
}

export async function processCommercePaymentWebhooks(input: {
  serviceClient: RpcClient;
  limit?: number;
}): Promise<CommercePaymentWorkerResult> {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_LIMIT_INVALID');
  }

  const claim = await input.serviceClient.rpc('commerce_claim_payment_webhooks', { p_limit: limit });
  if (claim.error) {
    throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_CLAIM_FAILED', { cause: claim.error });
  }

  const claimed = rows(claim.data);
  const result: CommercePaymentWorkerResult = {
    claimed: claimed.length,
    processed: 0,
    retried: 0,
    deadLettered: 0,
  };

  for (const job of claimed) {
    const processed = await input.serviceClient.rpc('commerce_process_payment_webhook', {
      p_webhook_inbox_id: job.webhook_inbox_id,
      p_processing_token: job.processing_token,
    });
    if (!processed.error) {
      result.processed += 1;
      continue;
    }

    const code = failureCode(processed.error);
    const failed = await input.serviceClient.rpc('commerce_fail_payment_webhook', {
      p_webhook_inbox_id: job.webhook_inbox_id,
      p_processing_token: job.processing_token,
      p_error_code: code,
      p_retryable: retryable(processed.error),
    });
    if (failed.error) {
      throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_FAILURE_RECORD_FAILED', { cause: failed.error });
    }
    if (failed.data === 'retry') result.retried += 1;
    else if (failed.data === 'dead_letter') result.deadLettered += 1;
    else if (failed.data === 'processed') result.processed += 1;
    else throw new CommercePaymentWorkerError('COMMERCE_WEBHOOK_FAILURE_INVALID_RESPONSE');
  }

  return result;
}
