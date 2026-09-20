import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * Test THỰC THI cho Edge Function sync-search-visibility.
 *
 * Không cần Deno, không cài thêm gì, không gọi mạng:
 *  - `typescript` (đã có trong repo) transpile index.ts sang JS;
 *  - module được ghi ra file .mjs tạm rồi nạp bằng `import()` thật, nên
 *    `import { timingSafeEqual } from "node:crypto"` chạy đúng như trên Deno;
 *  - `Deno`, `fetch` là stub đặt trên globalThis trước khi nạp;
 *  - `fetch` là mock nên không có request thật nào thoát ra ngoài.
 */

const EDGE_PATH = resolve(process.cwd(), 'supabase/functions/sync-search-visibility/index.ts');
const NEXT_URL = 'https://chonhaviet.com/api/admin/search-visibility';
const EDGE_URL = 'https://itgxladqskdcbwsbmuyi.supabase.co/functions/v1/sync-search-visibility';

type Handler = (req: Request) => Promise<Response> | Response;

type Harness = {
  handler: Handler;
  env: Record<string, string | undefined>;
  fetchMock: ReturnType<typeof vi.fn>;
  setEnv: (values: Record<string, string | undefined>) => void;
};

let tmpDir: string;
let moduleCounter = 0;

/** Transpile TS -> ESM và nạp như một module thật để `import` hoạt động. */
async function loadEdgeModule(): Promise<Harness> {
  const source = readFileSync(EDGE_PATH, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      lib: ['ES2022', 'DOM'],
    },
  }).outputText;

  const env: Record<string, string | undefined> = {};
  const fetchMock = vi.fn();
  let handler: Handler | null = null;

  (globalThis as Record<string, unknown>).Deno = {
    serve: (fn: Handler) => {
      handler = fn;
    },
    env: { get: (name: string) => env[name] },
  };
  (globalThis as Record<string, unknown>).fetch = fetchMock;

  const file = join(tmpDir, `edge-${moduleCounter++}.mjs`);
  writeFileSync(file, js, 'utf8');
  await import(pathToFileURL(file).href);

  if (!handler) throw new Error('Edge module không gọi Deno.serve khi nạp');
  return {
    handler,
    env,
    fetchMock,
    setEnv: values => {
      for (const key of Object.keys(env)) delete env[key];
      Object.assign(env, values);
    },
  };
}

function edgeRequest(
  method: string,
  opts: { secret?: string | null; authorization?: string | null } = {},
): Request {
  const headers = new Headers();
  if (opts.secret !== null && opts.secret !== undefined) {
    headers.set('x-search-visibility-cron-secret', opts.secret);
  }
  if (opts.authorization !== null && opts.authorization !== undefined) {
    headers.set('authorization', opts.authorization);
  }
  return new Request(EDGE_URL, { method, headers });
}

// Secret phải >= 32 byte để qua cổng cấu hình (xem CRON_SECRET_MIN_BYTES).
const CRON_SECRET = 'cron-secret-value-0123456789abcdef';
const SYNC_SECRET = 'sync-secret-value-0123456789abcdef';

const originalFetch = globalThis.fetch;

let harness: Harness;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'edge-test-'));
  harness = await loadEdgeModule();
  harness.setEnv({
    SEARCH_VISIBILITY_CRON_SECRET: CRON_SECRET,
    SEARCH_VISIBILITY_SYNC_SECRET: SYNC_SECRET,
  });
  harness.fetchMock.mockReset();
  harness.fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, runId: 'run-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete (globalThis as Record<string, unknown>).Deno;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sync-search-visibility Edge handler (thực thi)', () => {
  it('secret đúng: gọi downstream đúng MỘT lần, bằng Bearer sync và action sync', async () => {
    const response = await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));

    expect(response.status).toBe(200);
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = harness.fetchMock.mock.calls[0];
    expect(url).toBe(NEXT_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${SYNC_SECRET}`);
    expect(JSON.parse(init.body)).toEqual({ action: 'sync' });

    const json = await response.json();
    expect(json).toMatchObject({ success: true, result: { ok: true, runId: 'run-1' } });
  });

  it('secret đúng nhưng KHÔNG gửi kèm cổng cron (thiếu header) -> 401, không downstream', async () => {
    const response = await harness.handler(edgeRequest('POST'));

    expect(response.status).toBe(401);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('secret sai -> 401, không downstream', async () => {
    const response = await harness.handler(edgeRequest('POST', { secret: 'wrong-secret' }));

    expect(response.status).toBe(401);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('secret rỗng -> 401, không downstream', async () => {
    const response = await harness.handler(edgeRequest('POST', { secret: '' }));

    expect(response.status).toBe(401);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('secret cùng độ dài nhưng khác nội dung -> 401 (không lộ nhánh độ dài)', async () => {
    const other = 'cron-secret-value-0123456789abcdeZ';
    expect(other).toHaveLength(CRON_SECRET.length);
    const response = await harness.handler(edgeRequest('POST', { secret: other }));

    expect(response.status).toBe(401);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('secret cấu hình ngắn hơn 32 byte -> 503 fail-closed, không downstream', async () => {
    const shortSecret = 'too-short-secret';
    expect(Buffer.byteLength(shortSecret, 'utf8')).toBeLessThan(32);
    harness.setEnv({
      SEARCH_VISIBILITY_CRON_SECRET: shortSecret,
      SEARCH_VISIBILITY_SYNC_SECRET: SYNC_SECRET,
    });

    const response = await harness.handler(edgeRequest('POST', { secret: shortSecret }));

    expect(response.status).toBe(503);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('secret cấu hình đúng 32 byte được chấp nhận (biên dưới)', async () => {
    const exactly32 = 'a'.repeat(32);
    expect(Buffer.byteLength(exactly32, 'utf8')).toBe(32);
    harness.setEnv({
      SEARCH_VISIBILITY_CRON_SECRET: exactly32,
      SEARCH_VISIBILITY_SYNC_SECRET: SYNC_SECRET,
    });

    const response = await harness.handler(edgeRequest('POST', { secret: exactly32 }));

    expect(response.status).toBe(200);
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('secret cấu hình 31 byte bị từ chối (ngay dưới biên)', async () => {
    const exactly31 = 'a'.repeat(31);
    harness.setEnv({
      SEARCH_VISIBILITY_CRON_SECRET: exactly31,
      SEARCH_VISIBILITY_SYNC_SECRET: SYNC_SECRET,
    });

    const response = await harness.handler(edgeRequest('POST', { secret: exactly31 }));

    expect(response.status).toBe(503);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('Bearer anon/service-role KHÔNG được dùng làm danh tính cổng cron', async () => {
    const anon = await harness.handler(
      edgeRequest('POST', { authorization: `Bearer ${SYNC_SECRET}` }),
    );
    const serviceRole = await harness.handler(
      edgeRequest('POST', { authorization: 'Bearer service-role-key', secret: null }),
    );

    expect(anon.status).toBe(401);
    expect(serviceRole.status).toBe(401);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('thiếu cấu hình cron secret -> 503 fail-closed, không downstream', async () => {
    harness.setEnv({ SEARCH_VISIBILITY_SYNC_SECRET: SYNC_SECRET });

    const response = await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));

    expect(response.status).toBe(503);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('thiếu cấu hình sync secret -> 503 fail-closed, không downstream', async () => {
    harness.setEnv({ SEARCH_VISIBILITY_CRON_SECRET: CRON_SECRET });

    const response = await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));

    expect(response.status).toBe(503);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('GET và PUT bị chặn 405, không downstream', async () => {
    const get = await harness.handler(edgeRequest('GET', { secret: CRON_SECRET }));
    const put = await harness.handler(edgeRequest('PUT', { secret: CRON_SECRET }));

    expect(get.status).toBe(405);
    expect(put.status).toBe(405);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('OPTIONS vô hại: 200 và không downstream', async () => {
    const response = await harness.handler(edgeRequest('OPTIONS', { secret: CRON_SECRET }));

    expect(response.status).toBe(200);
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it('downstream lỗi: trả 502 đã khử trùng, không lộ body thượng nguồn hay secret', async () => {
    harness.fetchMock.mockResolvedValue(
      new Response('internal stack trace with cron-secret-value', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const response = await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(502);
    expect(serialized).not.toContain('internal stack trace');
    expect(serialized).not.toContain(CRON_SECRET);
    expect(serialized).not.toContain(SYNC_SECRET);
  });

  it('fetch ném lỗi (ví dụ timeout): trả 502 đã khử trùng, không lộ chi tiết', async () => {
    harness.fetchMock.mockRejectedValue(new Error(`boom ${CRON_SECRET}`));

    const response = await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(json)).not.toContain('boom');
    expect(JSON.stringify(json)).not.toContain(CRON_SECRET);
  });

  it('log lỗi không chứa secret hay body thượng nguồn', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.fetchMock.mockResolvedValue(
      new Response('upstream detail with sync-secret-value', { status: 503 }),
    );

    await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));

    const logged = errorSpy.mock.calls.map(call => call.map(String).join(' ')).join('\n');
    expect(logged).not.toContain(CRON_SECRET);
    expect(logged).not.toContain(SYNC_SECRET);
    expect(logged).not.toContain('upstream detail');
  });

  it('không bao giờ gửi secret cổng cron sang Next', async () => {
    await harness.handler(edgeRequest('POST', { secret: CRON_SECRET }));

    const [, init] = harness.fetchMock.mock.calls[0];
    const serialized = JSON.stringify(init);
    expect(serialized).not.toContain(CRON_SECRET);
    expect(init.headers['x-search-visibility-cron-secret']).toBeUndefined();
  });
});
