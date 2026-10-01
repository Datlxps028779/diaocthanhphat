import { describe, expect, it, vi } from 'vitest';
import { CommerceEmailProviderError } from '../commerceEmailProvider';
import { SmtpCommerceEmailProvider } from './smtpCommerceEmailProvider';

const message = {
  to: 'owner@example.test',
  subject: 'Thanh toán thành công',
  bodyText: 'Quyền lợi đã sẵn sàng trong tài khoản.',
  actionUrl: 'https://chonhaviet.com/tai-khoan?tab=commerce',
  templateKind: 'payment_succeeded' as const,
};

describe('SMTP commerce email provider', () => {
  it('sends escaped HTML and plain text without payment payloads', async () => {
    const sendMail = vi.fn(async (_options: Record<string, unknown>) => ({ messageId: 'smtp-message-1' }));
    const provider = new SmtpCommerceEmailProvider({ sendMail } as never, 'thanh-toan@chonhaviet.com');

    await expect(provider.send({ ...message, bodyText: '<b>Quyền lợi</b>' })).resolves.toEqual({
      providerMessageId: 'smtp-message-1',
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Chợ Nhà Việt <thanh-toan@chonhaviet.com>',
      to: 'owner@example.test',
      subject: 'Thanh toán thành công',
      text: expect.stringContaining('https://chonhaviet.com/tai-khoan?tab=commerce'),
      html: expect.stringContaining('&lt;b&gt;Quyền lợi&lt;/b&gt;'),
      headers: { 'X-Commerce-Template': 'payment_succeeded' },
    }));
    expect(JSON.stringify(sendMail.mock.calls[0]?.[0])).not.toMatch(/provider_metadata|payload_hash|accountNumber/);
  });

  it('rejects invalid addresses and empty messages before transport', async () => {
    const sendMail = vi.fn();
    const provider = new SmtpCommerceEmailProvider({ sendMail } as never, 'thanh-toan@chonhaviet.com');
    await expect(provider.send({ ...message, to: 'invalid' })).rejects.toMatchObject({
      code: 'smtp_email_invalid', retryable: false,
    });
    await expect(provider.send({ ...message, subject: ' ' })).rejects.toMatchObject({
      code: 'smtp_message_invalid', retryable: false,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('classifies transient SMTP transport errors without leaking messages', async () => {
    const sendMail = vi.fn(async () => { throw Object.assign(new Error('sensitive smtp response'), { code: 'ETIMEDOUT' }); });
    const provider = new SmtpCommerceEmailProvider({ sendMail } as never, 'thanh-toan@chonhaviet.com');
    const error = await provider.send(message).catch(value => value);
    expect(error).toBeInstanceOf(CommerceEmailProviderError);
    expect(error).toMatchObject({ code: 'ETIMEDOUT', retryable: true });
    expect(error.message).toBe('ETIMEDOUT');
  });

  it('classifies SMTP authentication failures as deterministic', async () => {
    const sendMail = vi.fn(async () => { throw Object.assign(new Error('credentials'), { code: 'EAUTH', responseCode: 535 }); });
    const provider = new SmtpCommerceEmailProvider({ sendMail } as never, 'thanh-toan@chonhaviet.com');
    await expect(provider.send(message)).rejects.toMatchObject({ code: 'EAUTH', retryable: false });
  });
});
