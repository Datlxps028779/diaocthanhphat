import type { CommerceEmailProvider, CommerceEmailTemplateKind } from '../commerceEmailProvider';
import { CommerceEmailProviderError } from '../commerceEmailProvider';

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

type ClaimedEmailDelivery = {
  email_delivery_id: string;
  processing_token: string;
  recipient_email: string;
  template_kind: CommerceEmailTemplateKind;
  subject: string;
  body_text: string;
  action_path: string | null;
  attempt_number: number;
};

export type CommerceEmailDispatcherResult = {
  claimed: number;
  sent: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
};

export class CommerceEmailDispatcherError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommerceEmailDispatcherError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function claimRows(data: unknown): ClaimedEmailDelivery[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_CLAIM_INVALID_RESPONSE');
  return data.map(value => {
    if (!value || typeof value !== 'object') {
      throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_CLAIM_INVALID_RESPONSE');
    }
    const row = value as Partial<ClaimedEmailDelivery>;
    if (
      typeof row.email_delivery_id !== 'string'
      || !UUID.test(row.email_delivery_id)
      || typeof row.processing_token !== 'string'
      || !UUID.test(row.processing_token)
      || typeof row.recipient_email !== 'string'
      || !EMAIL.test(row.recipient_email)
      || (row.template_kind !== 'payment_succeeded' && row.template_kind !== 'payment_failed')
      || typeof row.subject !== 'string'
      || !row.subject.trim()
      || typeof row.body_text !== 'string'
      || !row.body_text.trim()
      || (row.action_path !== null && (typeof row.action_path !== 'string' || !row.action_path.startsWith('/')))
      || !Number.isInteger(row.attempt_number)
      || (row.attempt_number ?? 0) < 1
    ) {
      throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_CLAIM_INVALID_RESPONSE');
    }
    return row as ClaimedEmailDelivery;
  });
}

function lostLease(error: RpcError): boolean {
  return error.code === '42501' && error.message === 'Email delivery claim is not owned by this worker.';
}

function boundedCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z0-9_:-]{2,80}$/.test(value) ? value : fallback;
}

async function recordFailure(input: {
  serviceClient: RpcClient;
  delivery: ClaimedEmailDelivery;
  code: string;
  retryable: boolean;
  providerMessageId?: string;
}): Promise<'sent' | 'retry' | 'dead_letter' | 'lease_lost'> {
  const result = await input.serviceClient.rpc('commerce_fail_email_delivery', {
    p_email_delivery_id: input.delivery.email_delivery_id,
    p_processing_token: input.delivery.processing_token,
    p_error_code: input.code,
    p_retryable: input.retryable,
    p_provider_message_id: input.providerMessageId ?? null,
  });
  if (result.error) {
    if (lostLease(result.error)) return 'lease_lost';
    throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_FAILURE_RECORD_FAILED', { cause: result.error });
  }
  if (result.data === 'sent' || result.data === 'retry' || result.data === 'dead_letter') return result.data;
  throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_FAILURE_INVALID_RESPONSE');
}

export async function dispatchCommerceEmails(input: {
  serviceClient: RpcClient;
  provider: CommerceEmailProvider;
  siteUrl: string;
  limit?: number;
}): Promise<CommerceEmailDispatcherResult> {
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_LIMIT_INVALID');
  }
  let siteOrigin: string;
  try {
    siteOrigin = new URL(input.siteUrl).origin;
  } catch {
    throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_SITE_URL_INVALID');
  }

  const claimed = await input.serviceClient.rpc('commerce_claim_email_deliveries', { p_limit: limit });
  if (claimed.error) {
    throw new CommerceEmailDispatcherError('COMMERCE_EMAIL_CLAIM_FAILED', { cause: claimed.error });
  }

  const rows = claimRows(claimed.data);
  const result: CommerceEmailDispatcherResult = {
    claimed: rows.length,
    sent: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  };

  for (const delivery of rows) {
    try {
      const sent = await input.provider.send({
        to: delivery.recipient_email,
        subject: delivery.subject,
        bodyText: delivery.body_text,
        actionUrl: delivery.action_path ? new URL(delivery.action_path, siteOrigin).toString() : null,
        templateKind: delivery.template_kind,
      });
      const completed = await input.serviceClient.rpc('commerce_complete_email_delivery', {
        p_email_delivery_id: delivery.email_delivery_id,
        p_processing_token: delivery.processing_token,
        p_provider_message_id: sent.providerMessageId,
      });
      if (completed.error) {
        if (lostLease(completed.error)) {
          result.leaseLost += 1;
          continue;
        }
        const outcome = await recordFailure({
          serviceClient: input.serviceClient,
          delivery,
          code: boundedCode(completed.error.code, 'email_sent_completion_failed'),
          retryable: false,
          providerMessageId: sent.providerMessageId,
        });
        if (outcome === 'sent') result.sent += 1;
        else if (outcome === 'retry') result.retried += 1;
        else if (outcome === 'dead_letter') result.deadLettered += 1;
        else result.leaseLost += 1;
        continue;
      }
      if (completed.data !== 'sent') {
        const outcome = await recordFailure({
          serviceClient: input.serviceClient,
          delivery,
          code: 'email_complete_invalid_response',
          retryable: false,
          providerMessageId: sent.providerMessageId,
        });
        if (outcome === 'sent') result.sent += 1;
        else if (outcome === 'retry') result.retried += 1;
        else if (outcome === 'dead_letter') result.deadLettered += 1;
        else result.leaseLost += 1;
        continue;
      }
      result.sent += 1;
    } catch (error) {
      if (error instanceof CommerceEmailDispatcherError) throw error;
      const providerError = error instanceof CommerceEmailProviderError
        ? error
        : new CommerceEmailProviderError('email_provider_failed', true, { cause: error });
      const outcome = await recordFailure({
        serviceClient: input.serviceClient,
        delivery,
        code: boundedCode(providerError.code, 'email_provider_failed'),
        retryable: providerError.retryable,
      });
      if (outcome === 'sent') result.sent += 1;
      else if (outcome === 'retry') result.retried += 1;
      else if (outcome === 'dead_letter') result.deadLettered += 1;
      else result.leaseLost += 1;
    }
  }

  return result;
}
