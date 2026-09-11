import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../supabase/manual_a2_news_quality_corpus_dry_run.sql', import.meta.url),
  'utf8',
);

describe('A2 news corpus dry-run SQL contract', () => {
  it('does not use PostgreSQL POSIX \\b and does not turn proxy H2 into a blocker', () => {
    expect(sql).not.toContain("'<h2\\b'");
    expect(sql).toContain("'<h2[[:space:]>]'");
    expect(sql).toContain('H2_COUNT is informational only');
    expect(sql).not.toContain("CASE WHEN h2_count < 4 THEN 'H2_COUNT'");
  });

  it('counts empty content as zero words in the proxy', () => {
    expect(sql).toContain("nullif(btrim(regexp_replace(coalesce(n.content, ''), '<[^>]+>', ' ', 'g')), '')");
  });
});
