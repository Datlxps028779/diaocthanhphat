import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260909030000_news_publish_boundary.sql', import.meta.url),
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
});
