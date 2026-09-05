import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260905010000_news_publication_timestamp.sql'),
  'utf8',
);

describe('news publication timestamp migration', () => {
  it('uses a security-definer trigger with a fixed search path', () => {
    expect(migration).toMatch(/RETURNS trigger[\s\S]*LANGUAGE plpgsql[\s\S]*SECURITY DEFINER/);
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF is_published ON public.news');
  });

  it('stamps only inserts or false-to-true transitions missing a timestamp', () => {
    expect(migration).toContain("TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM NEW.is_published");
    expect(migration).toContain('NEW.published_at IS NULL');
    expect(migration).toContain('NEW.published_at := now()');
  });

  it('does not backfill existing rows and does not expose the function to clients', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.news\s+SET/i);
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.set_news_publication_timestamp() FROM PUBLIC, anon, authenticated;',
    );
  });
});
