import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const edgeSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/sync-search-visibility/index.ts'),
  'utf8',
);

describe('sync-search-visibility Edge Function contract', () => {
  it('chỉ nhận POST; OPTIONS trả lời vô hại và mọi method khác bị chặn', () => {
    expect(edgeSource).toContain('req.method === "OPTIONS"');
    expect(edgeSource).toContain('req.method !== "POST"');
    expect(edgeSource).toContain('405');
  });

  it('xác thực DB→Edge bằng header riêng x-search-visibility-cron-secret đọc từ env Edge', () => {
    expect(edgeSource).toContain('SEARCH_VISIBILITY_CRON_SECRET');
    expect(edgeSource).toContain('x-search-visibility-cron-secret');
    // Cổng cron không được dùng chung secret với cổng Edge→Next.
    expect(edgeSource).not.toContain('x-search-visibility-sync-secret');
  });

  it('import Buffer tường minh, không dựa vào global của Deno', () => {
    expect(edgeSource).toContain('import { Buffer } from "node:buffer"');
  });

  it('áp ngưỡng tối thiểu 32 byte cho secret cổng cron, khớp với migration', () => {
    expect(edgeSource).toContain('CRON_SECRET_MIN_BYTES = 32');
    expect(edgeSource).toMatch(/Buffer\.byteLength\(cronSecret, "utf8"\) < CRON_SECRET_MIN_BYTES/);
  });

  it('so sánh secret bằng constant-time qua node:crypto, không so sánh chuỗi trực tiếp', () => {
    // Deno 2.x không còn API so sánh hằng định trên WebCrypto -> phải dùng node:crypto.
    expect(edgeSource).toContain('import { timingSafeEqual } from "node:crypto"');
    expect(edgeSource).toContain('timingSafeEqual(left, right)');
    // Không được GỌI API WebCrypto đó (nhắc tới trong comment giải thích là hợp lệ).
    expect(edgeSource).not.toMatch(/crypto\.subtle\.timingSafeEqual\s*\(/);
    expect(edgeSource).not.toMatch(/header\s*!==\s*[A-Za-z_$][\w$]*Secret/);
    expect(edgeSource).not.toMatch(/[A-Za-z_$][\w$]*Secret\s*!==\s*header/);
  });

  it('chỉ gọi Next bằng Bearer SEARCH_VISIBILITY_SYNC_SECRET và action sync', () => {
    expect(edgeSource).toContain('SEARCH_VISIBILITY_SYNC_SECRET');
    expect(edgeSource).toContain('Bearer ${syncSecret}');
    expect(edgeSource).toContain('action: "sync"');
    expect(edgeSource).not.toContain('diagnose_access');
    expect(edgeSource).not.toContain('submit_sitemap');
    expect(edgeSource).not.toContain('inspect_batch');
  });

  it('fail-closed khi thiếu cấu hình trước khi gọi hạ tầng phía sau', () => {
    expect(edgeSource).toMatch(/if\s*\(!cronSecret[^)]*\)/);
    expect(edgeSource).toContain('503');
  });

  it('từ chối secret sai, rỗng, anon và service-role trước khi chạm route Next', () => {
    // Chỉ được lấy danh tính từ đúng header cổng cron.
    expect(edgeSource).toContain('req.headers.get("x-search-visibility-cron-secret")');
    expect(edgeSource).toMatch(/\}, 401\)/);
    // Không có nhánh nào đọc Authorization của request vào làm danh tính.
    expect(edgeSource).not.toMatch(/req\.headers\.get\(["']authorization/i);
    expect(edgeSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(edgeSource).not.toContain('SUPABASE_ANON_KEY');
  });

  it('không nhận URL tùy ý từ body và không log secret hay body thượng nguồn', () => {
    // URL đích là hằng số, không đọc từ request.
    expect(edgeSource).toContain('const EDGE_TO_NEXT_URL = "https://chonhaviet.com/api/admin/search-visibility"');
    // Không in giá trị secret ra log.
    expect(edgeSource).not.toMatch(/console\.\w+\([^)]*\$\{?\s*(cronSecret|syncSecret)/);
    // Không đọc body thượng nguồn vào log.
    expect(edgeSource).not.toContain('await response.text()');
    expect(edgeSource).not.toMatch(/console\.\w+\([^)]*[a-z]+\.message/);
  });

  it('không giữ client service-role không dùng', () => {
    expect(edgeSource).not.toContain('createClient');
  });
});
