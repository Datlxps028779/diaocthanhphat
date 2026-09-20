import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261011000000_search_visibility_cron_auth.sql'),
  'utf8',
);

const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_search_visibility_cron_auth_dry_run.sql'),
  'utf8',
);

describe('search visibility cron auth migration', () => {
  it('dùng security definer với search_path bị khóa', () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path\s*=\s*''/);
  });

  it('thu hồi quyền gọi khỏi PUBLIC, anon, authenticated, service_role và chỉ giữ postgres', () => {
    expect(migration).toMatch(/REVOKE[^;]*FROM PUBLIC,\s*anon,\s*authenticated,\s*service_role\s*;/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*?TO postgres/);
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]{0,80}TO\s+(?:anon|authenticated|service_role)/);
  });

  it('đọc đúng một secret không rỗng từ Vault theo tên cụ thể', () => {
    expect(migration).toContain('vault.decrypted_secrets');
    expect(migration).toMatch(/WHERE name = 'search_visibility_cron_secret'/);
    expect(migration).toMatch(/count\(\*\)/);
    expect(migration).toMatch(/IS DISTINCT FROM 1/);
    // Không dùng max() để tránh lấy giá trị tùy ý khi có nhiều dòng.
    expect(migration).not.toMatch(/max\(decrypted_secret\)/);
    expect(migration).toMatch(/array_agg\(decrypted_secret\)/);
  });

  it('fail-closed khi secret thiếu, rỗng hoặc trùng nhiều bản ghi', () => {
    expect(migration).toMatch(/\bRETURN\b/);
    expect(migration).toMatch(/NULLIF\(btrim\(/);
    expect(migration).toMatch(/count\(/);
  });

  it('chỉ gọi Edge URL đã biết và kiểm tra URL hợp lệ trước khi post', () => {
    expect(migration).toContain('https://itgxladqskdcbwsbmuyi.supabase.co/functions/v1/sync-search-visibility');
    expect(migration).toMatch(/NOT LIKE 'https:\/\/%'/);
    expect(migration).toContain('net.http_post');
  });

  it('gửi secret qua header x-search-visibility-cron-secret chứ không nhúng vào body', () => {
    expect(migration).toContain("'x-search-visibility-cron-secret'");
    expect(migration).not.toMatch(/body\s*:=\s*jsonb_build_object\([^)]*secret/i);
  });

  it('không chứa credential literal hay khóa service-role', () => {
    expect(migration).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(migration).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(migration).not.toContain('[YOUR-PASSWORD]');
    expect(migration).not.toContain('postgresql://');
  });

  it('giữ nguyên lịch 7,37 và KHÔNG tự bật lại job đang pause', () => {
    expect(migration).toContain("'7,37 * * * *'");
    // Không bao giờ đặt active := true ở bất kỳ đâu.
    expect(migration).not.toMatch(/active\s*:=\s*true/i);
    // Phải ghi nhớ trạng thái trước đó rồi pause lại nếu trước đó là pause.
    expect(migration).toMatch(/SELECT COALESCE\(bool_or\(active\), false\)\s+INTO v_was_active/);
    expect(migration).not.toMatch(/CREATE TEMP TABLE|_sv_cron_was_active/);
    expect(migration).toMatch(/cron\.alter_job\(job_id := v_job_id, active := false\)/);
    expect(migration).toMatch(/IF NOT v_was_active THEN/);
  });

  it('ghi nhớ trạng thái cron TRƯỚC khi unschedule', () => {
    const rememberAt = migration.indexOf('INTO v_was_active');
    const unscheduleAt = migration.indexOf("cron.unschedule('search-visibility-auto-sync')");
    expect(rememberAt).toBeGreaterThan(-1);
    expect(unscheduleAt).toBeGreaterThan(-1);
    expect(rememberAt).toBeLessThan(unscheduleAt);
  });

  it('idempotent: unschedule trước khi schedule lại cùng tên job', () => {
    expect(migration).toContain('cron.unschedule');
    expect(migration).toContain("'search-visibility-auto-sync'");
    expect(migration).toMatch(/EXISTS \(SELECT 1 FROM cron\.job/);
  });

  it('gói toàn bộ thay đổi trong một DO, không phụ thuộc transaction qua nhiều câu lệnh', () => {
    expect(migration).toMatch(/DO \$migration\$/);
    expect(migration.trim()).toMatch(/END \$migration\$;$/);
    expect(migration).not.toMatch(/^\s*(?:COMMIT|ROLLBACK);/m);
    expect(migration).not.toMatch(/CREATE TEMP TABLE|ON COMMIT DROP/);
    expect(migration).toContain('EXECUTE $wrapper$');
  });

  it('áp ngưỡng tối thiểu 32 byte cho secret, khớp với Edge', () => {
    expect(migration).toMatch(/octet_length\(v_secret\) < 32/);
  });

  it('drop hàm cũ trước khi tạo lại vì bản cũ trả về void', () => {
    // CREATE OR REPLACE không đổi được kiểu trả về -> phải DROP trước.
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.refresh_search_visibility_eligibility()');
    expect(migration).toMatch(/DROP FUNCTION[\s\S]*CREATE OR REPLACE FUNCTION public\.refresh_search_visibility_eligibility\(\)[\s\S]*RETURNS integer/);
  });

  it('gỡ job cron cũ trước khi drop hàm để không còn tham chiếu treo', () => {
    const unscheduleAt = migration.indexOf("cron.unschedule('search-visibility-auto-sync')");
    const dropAt = migration.indexOf('DROP FUNCTION IF EXISTS public.refresh_search_visibility_eligibility()');
    expect(unscheduleAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(-1);
    expect(unscheduleAt).toBeLessThan(dropAt);
  });

  it('dry-run nhúng đúng migration, không dùng bảng tạm hoặc transaction qua nhiều câu lệnh', () => {
    const embedded = dryRun.split('EXECUTE $migration_sql$\n')[1]?.split('    $migration_sql$;')[0];
    expect(embedded).toBe(migration);
    expect(dryRun).not.toMatch(/CREATE TEMP TABLE|_sv_cron_was_active/);
    expect(dryRun).not.toMatch(/^\s*(?:COMMIT|ROLLBACK);/m);
  });

  it('dry-run không yêu cầu khóa dòng hoặc ghi trực tiếp vào bảng cron.job', () => {
    expect(dryRun).not.toMatch(/FROM cron\.job[^;]*FOR\s+(?:UPDATE|NO KEY UPDATE|SHARE|KEY SHARE)/i);
    expect(dryRun).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM|LOCK TABLE)\s+cron\.job/i);
  });

  it('dry-run chỉ bắt ngoại lệ rollback riêng sau khi kiểm chứng đạt', () => {
    const verification = dryRun.indexOf('STOP: cron verification failed');
    const rollback = dryRun.indexOf("RAISE EXCEPTION USING ERRCODE = 'ZSV01'");
    expect(verification).toBeGreaterThan(-1);
    expect(rollback).toBeGreaterThan(verification);
    expect(dryRun).toContain("WHEN SQLSTATE 'ZSV01' THEN");
    expect(dryRun).toContain('v_before_function IS DISTINCT FROM v_after_function');
    expect(dryRun).toContain('v_before_jobs IS DISTINCT FROM v_after_jobs');
  });

  it('chỉ unschedule một lần và chỉ schedule một lần trong toàn migration', () => {
    expect(migration.match(/cron\.unschedule\(/g) ?? []).toHaveLength(1);
    expect(migration.match(/cron\.schedule\(/g) ?? []).toHaveLength(1);
  });
});
