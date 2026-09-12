import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260909030000_news_publish_boundary.sql', import.meta.url),
  'utf8',
);
const hardenedMigration = readFileSync(
  new URL('../../supabase/migrations/20260911010000_harden_news_publication_server_boundary.sql', import.meta.url),
  'utf8',
);
const ambiguityFixMigration = readFileSync(
  new URL('../../supabase/migrations/20260912010000_fix_news_publication_rpc_id_ambiguity.sql', import.meta.url),
  'utf8',
);
const triggerBoundaryFixMigration = readFileSync(
  new URL('../../supabase/migrations/20260930090000_fix_news_publication_boundary_trigger.sql', import.meta.url),
  'utf8',
);
const ragDeferredBoundaryMigration = readFileSync(
  new URL('../../supabase/migrations/20260930100000_defer_rag_browser_execution.sql', import.meta.url),
  'utf8',
);

describe('news publication boundary migration', () => {
  it('creates an owner-MFA optimistic publish RPC with atomic event', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.publish_news_article');
    expect(migration).toContain('NOT public.is_owner_mfa()');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('current_news.content_version <> p_expected_content_version');
    expect(migration).toContain('INSERT INTO public.news_publication_events');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
  });

  it('blocks direct publication transitions and keeps browser ACL bounded', () => {
    expect(migration).toContain('CREATE TRIGGER trg_guard_news_publication_boundary');
    expect(migration).toContain("current_setting('app.news_publication_boundary', true)");
    expect(migration).toContain('REVOKE ALL ON TABLE public.news_publication_events FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.publish_news_article(uuid, bigint, boolean, jsonb, jsonb) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.publish_news_article(uuid, bigint, boolean, jsonb, jsonb) TO authenticated');
  });

  it('requires a passing quality report and real citation invariant before publish', () => {
    expect(migration).toContain("coalesce(p_quality_report ->> 'passed', 'false') <> 'true'");
    expect(migration).toContain('public.news_has_publication_citations(current_news.citations)');
  });

  it('moves the transition RPC behind service_role and preserves actor identity', () => {
    expect(hardenedMigration).toContain('CREATE OR REPLACE FUNCTION public.publish_news_article_server');
    expect(hardenedMigration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(hardenedMigration).toContain('p_actor_id uuid');
    expect(hardenedMigration).toContain('event_id, news_id, actor_id');
    expect(hardenedMigration).toContain('current_news.id, p_actor_id');
    expect(hardenedMigration).toContain('REVOKE ALL ON FUNCTION public.publish_news_article(uuid, bigint, boolean, jsonb, jsonb)');
    expect(hardenedMigration).toContain('GRANT EXECUTE ON FUNCTION public.publish_news_article_server(uuid, bigint, boolean, uuid, jsonb, jsonb)');
  });

  it('qualifies all RPC relation columns so the RETURNS TABLE id cannot collide', () => {
    expect(ambiguityFixMigration).toContain('FROM public.profiles AS profile');
    expect(ambiguityFixMigration).toContain('WHERE profile.id = p_actor_id AND profile.role = \'admin\'');
    expect(ambiguityFixMigration).toContain('FROM public.news AS n');
    expect(ambiguityFixMigration).toContain('UPDATE public.news AS n');
    expect(ambiguityFixMigration).toContain('WHERE n.id = current_news.id');
    expect(ambiguityFixMigration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(ambiguityFixMigration).toContain('GRANT EXECUTE ON FUNCTION public.publish_news_article_server(uuid, bigint, boolean, uuid, jsonb, jsonb)');
  });

  it('lets only the service-role publication boundary pass the staff trigger', () => {
    expect(triggerBoundaryFixMigration).toContain('CREATE OR REPLACE FUNCTION public.enforce_staff_content_permission()');
    expect(triggerBoundaryFixMigration).toContain("current_setting('app.news_publication_boundary', true) = 'allowed'");
    expect(triggerBoundaryFixMigration).toContain("coalesce(auth.role(), '') = 'service_role'");
    expect(triggerBoundaryFixMigration).toContain("public.has_staff_permission(v_module, 'edit'");
    expect(triggerBoundaryFixMigration).toContain('REVOKE ALL ON FUNCTION public.enforce_staff_content_permission()');
  });

  it('defers direct browser RAG execution while keeping the server boundary', () => {
    expect(ragDeferredBoundaryMigration).toContain('REVOKE ALL ON FUNCTION public.refresh_rag_index(text)');
    expect(ragDeferredBoundaryMigration).toContain('FROM PUBLIC, anon, authenticated');
    expect(ragDeferredBoundaryMigration).toContain('GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text)');
    expect(ragDeferredBoundaryMigration).toContain('TO service_role');
    expect(ragDeferredBoundaryMigration).not.toContain('TO authenticated');
  });
});
