import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911000000_ai_reco_atomic_budget.sql'),
  'utf8',
);
const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-reco/index.ts'),
  'utf8',
);
const claudeClient = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-reco/claude.ts'),
  'utf8',
);

describe('ai-reco atomic budget migration', () => {
  it('tuần tự hóa quota và tăng minute/hour trong cùng transaction', () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('ai-reco-budget', 0))");
    expect(migration).toContain("v_minute_count, 0) >= 30");
    expect(migration).toContain("v_hour_count, 0) >= 300");
    expect(migration).toContain('SET request_count = request_count + 1');
  });

  it('chỉ cho service_role giữ quyền gọi quota RPC', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.reserve_ai_reco_budget\(\) FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_ai_reco_budget\(\) TO service_role/);
  });

  it('Edge fail-closed khi không reserve được budget', () => {
    expect(edge).toContain('db.rpc("reserve_ai_reco_budget")');
    expect(edge).toContain('budgetError || budgetReserved !== true');
  });

  it('claim cache key trước khi gọi AI để chỉ một request xử lý cold miss', () => {
    expect(edge).toContain('ranked: { pending: true }');
    expect(edge).toContain('claimError.code === "23505"');
    expect(edge).toContain('diagnostic: "ranking_pending"');
  });

  it('mỗi quota slot chỉ tạo một provider attempt và không gửi sampling cũ', () => {
    expect(claudeClient).toContain('maxRetries: 0');
    expect(claudeClient).not.toContain('temperature');
  });

  it('cache lỗi gateway ngắn hạn để không gọi lặp cùng một cache key', () => {
    expect(edge).toContain('FAILURE_CACHE_TTL_MS = 15 * 60 * 1000');
    expect(edge).toContain('ranked: []');
    expect(edge).toContain('diagnostic: "cached_failure"');
  });
});
