import { createTransport, type Transporter } from 'nodemailer';
import {
  CommerceEmailProviderError,
  type CommerceEmailMessage,
  type CommerceEmailProvider,
  type CommerceEmailSendResult,
} from '../commerceEmailProvider';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function providerError(error: unknown): CommerceEmailProviderError {
  if (error instanceof CommerceEmailProviderError) return error;
  const value = error as { code?: unknown; responseCode?: unknown };
  const code = typeof value?.code === 'string' && /^[A-Za-z0-9_:-]{2,80}$/.test(value.code)
    ? value.code
    : 'smtp_send_failed';
  const responseCode = typeof value?.responseCode === 'number' ? value.responseCode : null;
  const retryable = responseCode != null
    ? responseCode >= 400 && responseCode < 500
    : ['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'EDNS'].includes(code);
  return new CommerceEmailProviderError(code, retryable, { cause: error });
}

export class SmtpCommerceEmailProvider implements CommerceEmailProvider {
  readonly name = 'smtp';

  constructor(
    private readonly transporter: Pick<Transporter, 'sendMail'>,
    private readonly fromEmail: string,
  ) {}

  async send(message: CommerceEmailMessage): Promise<CommerceEmailSendResult> {
    if (!EMAIL.test(message.to) || !EMAIL.test(this.fromEmail)) {
      throw new CommerceEmailProviderError('smtp_email_invalid', false);
    }
    if (!message.subject.trim() || !message.bodyText.trim()) {
      throw new CommerceEmailProviderError('smtp_message_invalid', false);
    }

    const action = message.actionUrl
      ? `<p style="margin:24px 0"><a href="${escapeHtml(message.actionUrl)}" style="background:#dc2626;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Xem trong tài khoản</a></p>`
      : '';
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827"><h1 style="font-size:20px">${escapeHtml(message.subject)}</h1><p style="line-height:1.6">${escapeHtml(message.bodyText)}</p>${action}<p style="margin-top:32px;color:#6b7280;font-size:12px">Email tự động từ Chợ Nhà Việt. Không gửi thông tin thanh toán nhạy cảm qua email.</p></div>`;

    try {
      const result = await this.transporter.sendMail({
        from: `Chợ Nhà Việt <${this.fromEmail}>`,
        to: message.to,
        subject: message.subject,
        text: `${message.bodyText}${message.actionUrl ? `\n\nXem trong tài khoản: ${message.actionUrl}` : ''}`,
        html,
        headers: {
          'X-Commerce-Template': message.templateKind,
        },
      });
      if (typeof result.messageId !== 'string' || !result.messageId.trim()) {
        throw new CommerceEmailProviderError('smtp_message_id_missing', true);
      }
      return { providerMessageId: result.messageId };
    } catch (error) {
      throw providerError(error);
    }
  }
}

export function createSmtpCommerceEmailProviderFromEnv(): SmtpCommerceEmailProvider {
  const host = process.env.COMMERCE_SMTP_HOST?.trim();
  const port = Number(process.env.COMMERCE_SMTP_PORT ?? '');
  const user = process.env.COMMERCE_SMTP_USER?.trim();
  const password = process.env.COMMERCE_SMTP_PASSWORD;
  const fromEmail = process.env.COMMERCE_EMAIL_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !fromEmail || !EMAIL.test(fromEmail)) {
    throw new CommerceEmailProviderError('smtp_configuration_missing', false);
  }
  const secure = process.env.COMMERCE_SMTP_SECURE === 'true' || port === 465;
  return new SmtpCommerceEmailProvider(createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  }), fromEmail);
}
