import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/server/requireAdmin';
import { createPayOSProviderFromEnv } from '@/lib/server/payosProvider';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 64 * 1024;

function occurredAt(value: string | null): string | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload quá lớn.' }, { status: 413 });
  }

  const serviceClient = adminClient();
  if (!serviceClient) return NextResponse.json({ error: 'Webhook chưa được cấu hình.' }, { status: 503 });

  let event;
  try {
    event = await createPayOSProviderFromEnv().verifyWebhook({ rawBody, headers: Object.fromEntries(req.headers) });
  } catch {
    return NextResponse.json({ error: 'Webhook không hợp lệ.' }, { status: 400 });
  }

  const { error } = await serviceClient.rpc('commerce_enqueue_verified_payment_webhook', {
    p_provider: event.provider,
    p_provider_event_id: event.providerEventId,
    p_provider_payment_id: event.providerPaymentId,
    p_event_type: event.eventType,
    p_amount_minor: event.amountMinor,
    p_currency: event.currency,
    p_payload_hash: event.payloadHash,
    p_signed_data_hash: event.signedDataHash,
    p_payload: event.payload,
    p_occurred_at: occurredAt(event.occurredAt),
  });

  if (error) {
    console.error('[commerce/webhook/payos] durable enqueue failed:', error.code ?? 'unknown');
    return NextResponse.json({ error: 'Chưa ghi nhận được webhook.' }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
