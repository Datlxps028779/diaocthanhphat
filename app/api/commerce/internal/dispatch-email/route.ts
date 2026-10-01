import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchCommerceEmails } from '@/lib/server/commerceEmailDispatcher';
import { createSmtpCommerceEmailProviderFromEnv } from '@/lib/server/smtpCommerceEmailProvider';
import { adminClient } from '@/lib/server/requireAdmin';
import { getSiteUrl } from '@/lib/siteUrl';

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

  let provider;
  try {
    provider = createSmtpCommerceEmailProviderFromEnv();
  } catch {
    return NextResponse.json({ error: 'Email worker chưa được cấu hình.' }, { status: 503 });
  }
  const serviceClient = adminClient();
  if (!serviceClient) {
    return NextResponse.json({ error: 'Worker chưa được cấu hình.' }, { status: 503 });
  }

  try {
    const result = await dispatchCommerceEmails({
      serviceClient,
      provider,
      siteUrl: getSiteUrl(),
      limit: 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
    console.error('[commerce/internal/dispatch-email] worker failed:', code);
    return NextResponse.json({ error: 'Worker chưa gửi xong email.' }, { status: 503 });
  }
}
