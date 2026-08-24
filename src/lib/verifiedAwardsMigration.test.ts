import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909000000_about_awards_structured_evidence.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_about_awards_structured_evidence_dry_run.sql'),
  'utf8',
);

describe('about awards structured evidence migration contract', () => {
  it('converts legacy rows to draft records without inventing a source URL', () => {
    expect(migration).toContain("jsonb_build_object('title', btrim(line), 'source_url', '')");
    expect(migration).toContain("jsonb_build_object('version', 1, 'items', normalized_items)::text");
    expect(migration).not.toContain('https://');
  });

  it('maps legacy JSON text fields into titles and updates only the awards block', () => {
    expect(migration).toContain("current_type = 'collection'");
    expect(migration).toContain("item ->> 'text'");
    expect(migration).toContain("item - 'text'");
    expect(migration).toContain("page_slug = 'about' AND section = 'awards' AND key = 'items'");
    expect(migration).toContain("type = 'collection'");
  });

  it('ships a read-only dry-run that measures source-gated public output', () => {
    expect(dryRun).toContain('READ ONLY');
    expect(dryRun).toContain('public_items_after_gate');
    expect(dryRun).toContain('draft_items_needing_source');
    const executableSql = dryRun.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
    expect(executableSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
  });
});
