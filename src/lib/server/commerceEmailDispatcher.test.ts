import { describe, expect, it, vi } from 'vitest';
import { CommerceEmailProviderError, type CommerceEmailProvider } from '../commerceEmailProvider';
import { dispatchCommerceEmails } from './commerceEmailDispatcher';

const deliveryId = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const claim = [{
  email_delivery_id: deliveryId,
  processing_token: token,
  recipient_email: 'owner@example.test',
  template_kind: 'payment_succeeded',
  subject: 'Thanh toán thành công',
  body_text: 'Quyền lợi đã sẵn sàng.',
  action_path: '/tai-khoan?tab=commerce',
  attempt_number: 1,
}];

function client(responses: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  return { rpc: vi.fn(async () => responses.shift() ?? { data: null, error: null }) };
}

function provider(): CommerceEmailProvider {
  return {
    name: 'smtp',
    send: vi.fn(async () => ({ providerMessageId: 'smtp-message-1' })),
  };
}

describe('commerce email dispatcher', () => {
  it('claims, sends and completes a bounded email batch', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: 'sent', error: null },
    ]);
    const emailProvider = provider();
    await expect(dispatchCommerceEmails({
      serviceClient,
      provider: emailProvider,
      siteUrl: 'https://chonhaviet.com',
    })).resolves.toEqual({ claimed: 1, sent: 1, retried: 0, deadLettered: 0, leaseLost: 0 });
    expect(emailProvider.send).toHaveBeenCalledWith({
      to: 'owner@example.test',
      subject: 'Thanh toán thành công',
      bodyText: 'Quyền lợi đã sẵn sàng.',
      actionUrl: 'https://chonhaviet.com/tai-khoan?tab=commerce',
      templateKind: 'payment_succeeded',
    });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_complete_email_delivery', {
      p_email_delivery_id: deliveryId,
      p_processing_token: token,
      p_provider_message_id: 'smtp-message-1',
    });
  });

  it('retries transient provider failures without persisting raw errors', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: 'retry', error: null },
    ]);
    const emailProvider = provider();
    vi.mocked(emailProvider.send).mockRejectedValueOnce(new CommerceEmailProviderError('ETIMEDOUT', true));
    await expect(dispatchCommerceEmails({ serviceClient, provider: emailProvider, siteUrl: 'https://chonhaviet.com' }))
      .resolves.toMatchObject({ retried: 1 });
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(2, 'commerce_fail_email_delivery', {
      p_email_delivery_id: deliveryId,
      p_processing_token: token,
      p_error_code: 'ETIMEDOUT',
      p_retryable: true,
      p_provider_message_id: null,
    });
  });

  it('dead-letters deterministic provider failures', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: 'dead_letter', error: null },
    ]);
    const emailProvider = provider();
    vi.mocked(emailProvider.send).mockRejectedValueOnce(new CommerceEmailProviderError('EAUTH', false));
    await expect(dispatchCommerceEmails({ serviceClient, provider: emailProvider, siteUrl: 'https://chonhaviet.com' }))
      .resolves.toMatchObject({ deadLettered: 1 });
  });

  it('never retries SMTP after send succeeded but completion became uncertain', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: 'PGRST003', message: 'database timeout' } },
      { data: 'dead_letter', error: null },
    ]);
    const emailProvider = provider();
    await expect(dispatchCommerceEmails({ serviceClient, provider: emailProvider, siteUrl: 'https://chonhaviet.com' }))
      .resolves.toMatchObject({ deadLettered: 1, sent: 0 });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    expect(serviceClient.rpc).toHaveBeenNthCalledWith(3, 'commerce_fail_email_delivery', {
      p_email_delivery_id: deliveryId,
      p_processing_token: token,
      p_error_code: 'PGRST003',
      p_retryable: false,
      p_provider_message_id: 'smtp-message-1',
    });
  });

  it('skips a stale completion lease without sending again', async () => {
    const serviceClient = client([
      { data: claim, error: null },
      { data: null, error: { code: '42501', message: 'Email delivery claim is not owned by this worker.' } },
    ]);
    await expect(dispatchCommerceEmails({ serviceClient, provider: provider(), siteUrl: 'https://chonhaviet.com' }))
      .resolves.toMatchObject({ leaseLost: 1, sent: 0 });
  });

  it('rejects malformed claims and invalid site URLs before delivery', async () => {
    await expect(dispatchCommerceEmails({ serviceClient: client([]), provider: provider(), siteUrl: 'invalid' }))
      .rejects.toMatchObject({ code: 'COMMERCE_EMAIL_SITE_URL_INVALID' });
    await expect(dispatchCommerceEmails({
      serviceClient: client([{ data: [{ ...claim[0], recipient_email: 'invalid' }], error: null }]),
      provider: provider(),
      siteUrl: 'https://chonhaviet.com',
    })).rejects.toMatchObject({ code: 'COMMERCE_EMAIL_CLAIM_INVALID_RESPONSE' });
  });
});
