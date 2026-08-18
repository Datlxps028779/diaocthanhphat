import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260905000000_guard_news_publication_citations.sql'),
  'utf8',
);

describe('P8 news publication citation migration contract', () => {
  it('enforces a source floor only for new publication transitions', () => {
    expect(migration).toContain('TG_OP = \'INSERT\' OR OLD.is_published IS DISTINCT FROM NEW.is_published');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF is_published ON public.news');
    expect(migration).toContain('NEW.is_published');
    expect(migration).not.toContain('UPDATE public.news SET is_published');
  });

  it('requires two distinct, titled HTTP(S) citation records', () => {
    expect(migration).toContain("jsonb_typeof(p_citations) = 'array'");
    expect(migration).toContain("url ~* '^https?://");
    expect(migration).toContain('count(*) >= 2');
    expect(migration).toContain('count(DISTINCT lower(url)) = count(*)');
  });

  it('uses a fixed search path and does not expose guard functions to clients', () => {
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.news_has_publication_citations(jsonb) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.guard_news_publication_citations() FROM PUBLIC, anon, authenticated;');
  });
});
