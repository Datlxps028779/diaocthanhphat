import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260911020000_unify_public_aio_rag_boundary.sql'), 'utf8');
const deferredMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260930100000_defer_rag_browser_execution.sql'), 'utf8');

describe('unified public-to-AIO RAG migration contract', () => {
  it('keeps the server boundary and supported source allowlist', () => {
    expect(migration).toContain("coalesce(auth.role(), '') = 'service_role'");
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('public.refresh_rag_index', 0))");
    expect(migration).toContain("'property_types'");
    expect(migration).toContain("'news_categories'");
    expect(migration).toContain("'managed_pages'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.refresh_rag_index(text) FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text) TO authenticated, service_role;');
  });

  it('grounds public Product/News chunks in Search Visibility canonical paths', () => {
    expect(migration).toContain("sv.source_key = 'property:' || p.id::text");
    expect(migration).toContain("sv.source_key = 'news:' || n.id::text");
    expect(migration).toContain("news_category:static:' || btrim(nc.slug)");
    expect(migration).toContain("'property_type_name', pt.name");
    expect(migration).toContain('private boundary');
    expect(migration).toContain('không được đưa vào public AIO/RAG');
    expect(migration).toContain("AND btrim(coalesce(p.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
    expect(migration).toContain("AND mp.is_system = false");
    expect(migration).toContain("'/du-lieu-gia'");
    expect(migration).toContain("public.is_owner_mfa()");
  });

  it('removes direct browser execution while retaining the service boundary', () => {
    expect(deferredMigration).toContain('REVOKE ALL ON FUNCTION public.refresh_rag_index(text)');
    expect(deferredMigration).toContain('FROM PUBLIC, anon, authenticated');
    expect(deferredMigration).toContain('GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text)');
    expect(deferredMigration).toContain('TO service_role');
    expect(deferredMigration).not.toContain('TO authenticated');
  });
});
