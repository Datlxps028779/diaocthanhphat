export type CommerceEmailTemplateKind = 'payment_succeeded' | 'payment_failed';

export type CommerceEmailMessage = {
  to: string;
  subject: string;
  bodyText: string;
  actionUrl: string | null;
  templateKind: CommerceEmailTemplateKind;
};

export type CommerceEmailSendResult = {
  providerMessageId: string;
};

export interface CommerceEmailProvider {
  readonly name: string;
  send(message: CommerceEmailMessage): Promise<CommerceEmailSendResult>;
}

export class CommerceEmailProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'CommerceEmailProviderError';
  }
}
