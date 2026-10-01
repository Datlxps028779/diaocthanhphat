import { describe, expect, it } from 'vitest';
import { PAYOS_CAPABILITIES, type CommercePaymentProvider } from './commerceProvider';

describe('commerce payment provider contract', () => {
  it('records only capabilities documented by the current payOS API', () => {
    expect(PAYOS_CAPABILITIES).toEqual({
      hostedCheckout: true,
      signedWebhook: true,
      paymentStatusLookup: true,
      invoiceLookup: true,
      dedicatedSandbox: false,
      documentedRefundApi: false,
      documentedAutomaticRecurring: false,
    });
  });

  it('allows an adapter without refund when the provider does not document that API', () => {
    const provider: CommercePaymentProvider = {
      name: 'payos',
      capabilities: PAYOS_CAPABILITIES,
      createCheckout: async () => ({
        provider: 'payos',
        providerPaymentId: 'payment-1',
        checkoutUrl: 'https://example.test/checkout',
        expiresAt: null,
      }),
      verifyWebhook: async () => ({
        provider: 'payos',
        providerEventId: 'event-1',
        providerPaymentId: 'payment-1',
        eventType: 'payment.succeeded',
        amountMinor: 1000,
        currency: 'VND',
        occurredAt: null,
        payloadHash: 'a'.repeat(64),
        signedDataHash: 'b'.repeat(64),
        payload: {},
      }),
      getPayment: async () => ({
        provider: 'payos',
        providerPaymentId: 'payment-1',
        status: 'succeeded',
        amountMinor: 1000,
        currency: 'VND',
        paidAt: null,
      }),
    };
    expect(provider.createRefund).toBeUndefined();
  });
});
