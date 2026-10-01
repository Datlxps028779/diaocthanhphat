type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type ClaimedOutbox = {
  outbox_id: string;
  processing_token: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  attempt_number: number;
};

type DeliveryRow = {
  outcome: string;
  destination_type: string | null;
  destination_id: string | null;
};

export type CommerceOutboxDispatcherResult = {
  claimed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
};

export class CommerceOutboxDispatcherError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommerceOutboxDispatcherError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME = /^[a-z0-9_.:-]{2,100}$/;

function claimRows(data: unknown): ClaimedOutbox[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_CLAIM_INVALID_RESPONSE');
  return data.map(value => {
    if (!value || typeof value !== 'object') {
      throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_CLAIM_INVALID_RESPONSE');
    }
    const row = value as Partial<ClaimedOutbox>;
    if (
      typeof row.outbox_id !== 'string'
      || !UUID.test(row.outbox_id)
      || typeof row.processing_token !== 'string'
      || !UUID.test(row.processing_token)
      || typeof row.topic !== 'string'
      || !NAME.test(row.topic)
      || typeof row.aggregate_type !== 'string'
      || !NAME.test(row.aggregate_type)
      || typeof row.aggregate_id !== 'string'
      || !UUID.test(row.aggregate_id)
      || !Number.isInteger(row.attempt_number)
      || (row.attempt_number ?? 0) < 1
    ) {
      throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_CLAIM_INVALID_RESPONSE');
    }
    return row as ClaimedOutbox;
  });
}

function delivery(data: unknown): DeliveryRow {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') {
    throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_DELIVERY_INVALID_RESPONSE');
  }
  const row = value as Partial<DeliveryRow>;
  if (
    (row.outcome !== 'sent' && row.outcome !== 'already_sent')
    || (row.destination_type !== 'owner_notification' && row.destination_type !== 'operations_alert')
    || typeof row.destination_id !== 'string'
    || !UUID.test(row.destination_id)
  ) {
    throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_DELIVERY_INVALID_RESPONSE');
  }
  return row as DeliveryRow;
}

function lostLease(error: RpcError): boolean {
  return error.code === '42501' && error.message === 'Outbox claim is not owned by this worker.';
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

function errorCode(error: RpcError): string {
  return error.code && /^[A-Za-z0-9_:-]{2,80}$/.test(error.code) ? error.code : 'outbox_rpc_error';
}

async function failOutbox(input: {
  serviceClient: RpcClient;
  row: ClaimedOutbox;
  error: RpcError;
}): Promise<'sent' | 'retry' | 'dead_letter' | 'lease_lost'> {
  const failed = await input.serviceClient.rpc('commerce_fail_outbox', {
    p_outbox_id: input.row.outbox_id,
    p_processing_token: input.row.processing_token,
    p_error_code: errorCode(input.error),
    p_retryable: retryable(input.error),
  });
  if (failed.error) {
    if (lostLease(failed.error)) return 'lease_lost';
    throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_FAILURE_RECORD_FAILED', { cause: failed.error });
  }
  if (failed.data === 'sent' || failed.data === 'retry' || failed.data === 'dead_letter') return failed.data;
  throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_FAILURE_INVALID_RESPONSE');
}

export async function dispatchCommerceOutbox(input: {
  serviceClient: RpcClient;
  limit?: number;
}): Promise<CommerceOutboxDispatcherResult> {
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_LIMIT_INVALID');
  }

  const claimed = await input.serviceClient.rpc('commerce_claim_outbox', { p_limit: limit });
  if (claimed.error) {
    throw new CommerceOutboxDispatcherError('COMMERCE_OUTBOX_CLAIM_FAILED', { cause: claimed.error });
  }

  const rows = claimRows(claimed.data);
  const result: CommerceOutboxDispatcherResult = {
    claimed: rows.length,
    delivered: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  };

  for (const row of rows) {
    const delivered = await input.serviceClient.rpc('commerce_deliver_outbox', {
      p_outbox_id: row.outbox_id,
      p_processing_token: row.processing_token,
    });
    if (!delivered.error) {
      delivery(delivered.data);
      result.delivered += 1;
      continue;
    }
    if (lostLease(delivered.error)) {
      result.leaseLost += 1;
      continue;
    }

    const outcome = await failOutbox({ serviceClient: input.serviceClient, row, error: delivered.error });
    if (outcome === 'sent') result.delivered += 1;
    else if (outcome === 'retry') result.retried += 1;
    else if (outcome === 'dead_letter') result.deadLettered += 1;
    else result.leaseLost += 1;
  }

  return result;
}
