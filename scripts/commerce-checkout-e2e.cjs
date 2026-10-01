#!/usr/bin/env node
/*
 * Commerce checkout E2E harness.
 * Default mode is read-only. Checkout creation requires explicit opt-in.
 */
const fs = require('node:fs');
const process = require('node:process');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright-core');

const baseUrl = process.env.COMMERCE_E2E_BASE_URL || 'http://localhost:3001';
const storageState = process.env.COMMERCE_E2E_STORAGE_STATE;
const packageVersionId = process.env.COMMERCE_E2E_PACKAGE_VERSION_ID;
const allowCheckout = process.env.COMMERCE_E2E_ALLOW_CHECKOUT === 'true';
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function fail(message, code = 2) {
  console.error(`[commerce-e2e] ${message}`);
  process.exitCode = code;
}

if (!fs.existsSync(chromePath)) {
  fail(`Chrome không tồn tại tại ${chromePath}`);
} else if (!storageState || !fs.existsSync(storageState)) {
  fail('BLOCKED: cần storage state của owner/session được cấp phép qua COMMERCE_E2E_STORAGE_STATE; không tự tạo credential.');
} else {
  (async () => {
    const browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const browserErrors = [];
    const ignoredNonCommerceErrors = [];
    const commerceResponseErrors = [];
    let rpcHeaders = null;
    page.on('request', request => {
      if (!request.url().includes('/rest/v1/rpc/commerce_')) return;
      const headers = request.headers();
      if (headers.authorization && headers.apikey) {
        rpcHeaders = { authorization: headers.authorization, apikey: headers.apikey, 'content-type': 'application/json' };
      }
    });
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (message.text().includes('Failed to load resource')) ignoredNonCommerceErrors.push(message.text());
      else browserErrors.push(message.text());
    });
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/rest/v1/rpc/commerce_')) {
        commerceResponseErrors.push(`${new URL(response.url()).pathname}:${response.status()}`);
      }
    });

    const catalogResponsePromise = page.waitForResponse(
      response => response.url().includes('/rest/v1/rpc/commerce_get_catalog'),
      { timeout: 30_000 },
    ).catch(() => null);
    const accountResponsePromise = page.waitForResponse(
      response => response.url().includes('/rest/v1/rpc/commerce_get_my_account_snapshot'),
      { timeout: 30_000 },
    ).catch(() => null);

    try {
      await page.goto(`${baseUrl}/tai-khoan?tab=commerce`, { waitUntil: 'networkidle' });
      const accountHeading = await page.getByRole('heading', { name: 'Tài khoản của tôi' }).count();
      if (accountHeading !== 1) throw new Error('Account Hub không render đúng cho authorized session.');

      const catalogResponse = await catalogResponsePromise;
      if (!catalogResponse) throw new Error('Không quan sát được catalog RPC.');
      if (catalogResponse.status() === 404) {
        throw new Error('BLOCKED: Commerce catalog RPC trả 404; migration Commerce chưa được áp dụng trên Supabase project đang cấu hình.');
      }
      if (!catalogResponse.ok()) {
        throw new Error(`Commerce catalog RPC trả HTTP ${catalogResponse.status()}.`);
      }
      const accountResponse = await accountResponsePromise;
      if (!accountResponse) throw new Error('Không quan sát được account snapshot RPC.');
      if (!accountResponse.ok()) {
        throw new Error(`Commerce account snapshot RPC trả HTTP ${accountResponse.status()}.`);
      }
      if (commerceResponseErrors.length > 0) {
        throw new Error(`Commerce RPC errors: ${commerceResponseErrors.join(' | ')}`);
      }

      const catalog = await catalogResponse.json();
      if (!Array.isArray(catalog)) throw new Error('Catalog response không phải array.');
      if (catalog.length > 0 && !packageVersionId && allowCheckout) {
        throw new Error('Catalog có package nhưng chưa được chỉ định package version test.');
      }

      let writeResult = null;
      if (allowCheckout) {
        if (!packageVersionId) throw new Error('COMMERCE_E2E_PACKAGE_VERSION_ID bắt buộc khi cho phép checkout.');
        if (!rpcHeaders) throw new Error('Không capture được authenticated RPC headers.');
        if (!catalog.some(item => item?.package_version_id === packageVersionId)) {
          throw new Error('Package version test không tồn tại trong server-approved catalog staging.');
        }

        const supabaseOrigin = new URL(catalogResponse.url()).origin;
        const rpc = async (name, params) => {
          const response = await context.request.post(`${supabaseOrigin}/rest/v1/rpc/${name}`, {
            headers: rpcHeaders,
            data: params,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok()) {
            const code = data && typeof data === 'object' ? data.code || data.message : `HTTP_${response.status()}`;
            throw new Error(`${name} failed: ${String(code).slice(0, 120)}`);
          }
          return data;
        };

        const e2eKey = `e2e_staging_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        let orderId = null;
        let cleaned = false;
        try {
          const orderRows = await rpc('commerce_create_order', {
            p_package_version_id: packageVersionId,
            p_quantity: 1,
            p_idempotency_key: `order:${e2eKey}`,
          });
          const order = Array.isArray(orderRows) ? orderRows[0] : orderRows;
          if (!order?.order_id) throw new Error('commerce_create_order không trả order_id.');
          orderId = order.order_id;

          const attemptRows = await rpc('commerce_start_payment_attempt', {
            p_order_id: orderId,
            p_provider: 'payos',
            p_idempotency_key: `payment:${e2eKey}`,
          });
          const attempt = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
          if (!attempt?.payment_attempt_id || attempt.provider_payment_id != null || attempt.checkout_url != null) {
            throw new Error('Payment attempt staging vượt phạm vi no-provider.');
          }

          const cleanup = await rpc('commerce_e2e_close_test_checkout', {
            p_order_id: orderId,
            p_idempotency_key: e2eKey,
          });
          if (cleanup?.status !== 'cancelled' || cleanup?.attempts_closed !== 1) {
            throw new Error('Cleanup RPC không đóng đúng order/payment attempt.');
          }
          cleaned = true;

          const snapshot = await rpc('commerce_get_my_account_snapshot', {});
          const closedOrder = snapshot?.orders?.find(item => item.id === orderId);
          const closedAttempt = snapshot?.payments?.find(item => item.order_id === orderId);
          if (closedOrder?.status !== 'cancelled' || closedAttempt?.status !== 'cancelled') {
            throw new Error('Hậu kiểm snapshot không thấy order/attempt cancelled.');
          }

          writeResult = {
            orderCreated: true,
            paymentAttemptCreated: true,
            providerCalled: false,
            cleanup: 'PASS',
            finalOrderStatus: 'cancelled',
            finalAttemptStatus: 'cancelled',
          };
        } finally {
          if (orderId && !cleaned) {
            try {
              await rpc('commerce_e2e_close_test_checkout', {
                p_order_id: orderId,
                p_idempotency_key: e2eKey,
              });
            } catch (cleanupError) {
              throw new Error(`E2E cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
            }
          }
        }
      }

      if (browserErrors.length > 0) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);
      console.log(JSON.stringify({
        mode: allowCheckout ? 'write_no_provider' : 'read_only',
        baseUrl,
        accountHub: 'PASS',
        accountSnapshotRpc: 'PASS',
        catalogRpc: 'PASS',
        checkoutWrite: allowCheckout ? writeResult : 'NOT_RUN',
        browserErrors: 0,
        ignoredNonCommerceResourceErrors: ignoredNonCommerceErrors.length,
      }));
    } finally {
      await browser.close();
    }
  })().catch(error => {
    console.error(`[commerce-e2e] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
