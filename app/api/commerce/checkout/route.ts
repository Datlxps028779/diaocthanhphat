import { NextRequest, NextResponse } from 'next/server';
import { callerClient, adminClient } from '@/lib/server/requireAdmin';
import { CommerceCheckoutError, createCommerceCheckout } from '@/lib/server/commerceCheckout';
import { createPayOSProviderFromEnv } from '@/lib/server/payosProvider';
import { getSiteUrl } from '@/lib/siteUrl';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutPayload = {
  package_version_id?: string;
  order_id?: string;
  quantity: number;
  idempotency_key: string;
};

function parsePayload(value: unknown): CheckoutPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const packageVersionId = typeof body.package_version_id === 'string' && UUID_RE.test(body.package_version_id)
    ? body.package_version_id
    : undefined;
  const orderId = typeof body.order_id === 'string' && UUID_RE.test(body.order_id)
    ? body.order_id
    : undefined;
  if (!packageVersionId && !orderId) return null;
  if (body.package_version_id != null && !packageVersionId) return null;
  if (body.order_id != null && !orderId) return null;
  if (!Number.isInteger(body.quantity) || (body.quantity as number) < 1 || (body.quantity as number) > 100) return null;
  if (typeof body.idempotency_key !== 'string' || !/^[A-Za-z0-9_-]{16,140}$/.test(body.idempotency_key)) return null;
  return {
    package_version_id: packageVersionId,
    order_id: orderId,
    quantity: body.quantity as number,
    idempotency_key: body.idempotency_key,
  };
}

function checkoutErrorStatus(code: string): number {
  if (code === 'COMMERCE_QUANTITY_INVALID' || code === 'COMMERCE_IDEMPOTENCY_KEY_INVALID' || code === 'COMMERCE_PACKAGE_VERSION_REQUIRED') return 400;
  if (code === 'COMMERCE_PAYMENT_ATTEMPT_TERMINAL' || code === 'COMMERCE_CHECKOUT_CLAIM_FAILED') return 409;
  if (code === 'COMMERCE_AUTH_REQUIRED') return 401;
  return 503;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body quá lớn.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  const payload = parsePayload(body);
  if (!payload) return NextResponse.json({ error: 'Dữ liệu checkout không hợp lệ.' }, { status: 400 });

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  const userClient = callerClient(token);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ.' }, { status: 401 });

  const serviceClient = adminClient();
  if (!serviceClient) return NextResponse.json({ error: 'Dịch vụ thanh toán chưa được cấu hình.' }, { status: 503 });

  try {
    const result = await createCommerceCheckout({
      packageVersionId: payload.package_version_id ?? null,
      orderId: payload.order_id,
      quantity: payload.quantity,
      idempotencyKey: payload.idempotency_key,
      siteUrl: getSiteUrl(),
    }, {
      userClient,
      serviceClient,
      provider: createPayOSProviderFromEnv(),
    });
    return NextResponse.json(result, { status: result.status === 'checkout_ready' ? 201 : 202 });
  } catch (error) {
    const code = error instanceof CommerceCheckoutError ? error.code : 'COMMERCE_CHECKOUT_UNAVAILABLE';
    console.error('[commerce/checkout] checkout failed:', code);
    const status = checkoutErrorStatus(code);
    return NextResponse.json({ error: status >= 500 ? 'Chưa tạo được phiên thanh toán.' : 'Yêu cầu checkout chưa thể thực hiện.', code }, { status });
  }
}
