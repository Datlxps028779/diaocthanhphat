import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processCommercePaymentWebhooks } from '@/lib/server/commercePaymentWorker';
import { reconcileCommerceWalletTopups, processCommerceWalletPaymentWebhooks } from '@/lib/server/commerceWalletWebhookWorker';
import { reconcileCommercePayments } from '@/lib/server/commercePaymentReconciliation';
import { createPayOSProviderFromEnv } from '@/lib/server/payosProvider';
import { adminClient } from '@/lib/server/requireAdmin';

export const runtime = 'nodejs';

function authorized(req: NextRequest, expected: string): boolean {
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (expected.length < 32) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return providedBytes.byteLength === expectedBytes.byteLength
    && timingSafeEqual(providedBytes, expectedBytes);
}

export async function POST(req: NextRequest) {
  const secret = process.env.COMMERCE_WORKER_SECRET ?? '';
  if (secret.length < 32) {
    return NextResponse.json({ error: 'Worker chưa được cấu hình.' }, { status: 503 });
  }
  if (!authorized(req, secret)) {
    return NextResponse.json({ error: 'Không có quyền.' }, { status: 401 });
  }

  const serviceClient = adminClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Worker chưa được cấu hình.' }, { status: 503 });
  }

  try {
    const payos = createPayOSProviderFromEnv();
    const walletReconciliation = await reconcileCommerceWalletTopups({
      serviceClient,
      providers: { payos },
      limit: 10,
    });
    const walletPaymentEvents = await processCommerceWalletPaymentWebhooks({ serviceClient, limit: 10 });
    const reconciliation = await reconcileCommercePayments({
      serviceClient,
      providers: { payos },
      limit: 10,
    });
    const paymentEvents = await processCommercePaymentWebhooks({ serviceClient, limit: 10 });
    return NextResponse.json({ walletReconciliation, walletPaymentEvents, reconciliation, paymentEvents });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
    console.error('[commerce/internal/reconcile-payments] worker failed:', code);
    return NextResponse.json({ error: 'Worker chưa đối soát xong batch.' }, { status: 503 });
  }
}

export const GET = POST;
