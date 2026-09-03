import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260926000000_user_listing_owner_mapping.sql'),
  'utf8'
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_user_listing_owner_mapping_dry_run.sql'),
  'utf8'
);
const submitApi = readFileSync(
  resolve(process.cwd(), 'src/lib/api/userListings.ts'),
  'utf8'
);

const executableSql = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe('user listing owner mapping contract', () => {
  it('derives new listing ownership from the authenticated user', () => {
    expect(migration).toContain('NEW.user_id := auth.uid();');
    expect(migration).toContain("Authentication required to submit a listing");
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.user_listings');
  });

  it('keeps ownership immutable and limits maintenance to property links', () => {
    expect(migration).toContain('IF NEW.user_id IS DISTINCT FROM OLD.user_id');
    expect(migration).toContain("session_user IN ('postgres', 'supabase_admin')");
    expect(migration).toContain('SET property_id = pairs.property_id');
    expect(migration).not.toContain('SET user_id =');
  });

  it('backfills only approved one-to-one matches', () => {
    expect(migration).toContain("WHERE ul.status = 'approved'");
    expect(migration).toContain('property_candidate_count = 1');
    expect(migration).toContain('listing_candidate_count = 1');
    expect(migration).toContain('AND ul.property_id IS NULL');
  });

  it('keeps the preflight read-only', () => {
    expect(executableSql(dryRun)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|NOTIFY)\b/);
    expect(dryRun).toContain("'safe_one_to_one_candidates'");
    expect(dryRun).toContain("'ambiguous_candidate_properties'");
    expect(dryRun).toContain('SELECT property_id, listing_id, user_id, property_title');
  });

  it('does not let the client submit an owner id', () => {
    expect(submitApi).toContain(".from('user_listings')");
    expect(submitApi).toContain('.insert(canonicalListingTitle(listing))');
    expect(submitApi).not.toContain('user_id:');
  });
});
