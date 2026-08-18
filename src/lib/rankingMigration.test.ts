import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rankingMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903040000_explainable_organic_ranking.sql'),
  'utf8',
);

const organicFunction = rankingMigration.match(
  /CREATE OR REPLACE FUNCTION public\.search_property_matches\([\s\S]+?NOTIFY pgrst/s,
)?.[0] ?? '';
const advisorFunction = rankingMigration.match(
  /CREATE OR REPLACE FUNCTION public\.match_properties_for_advisor\([\s\S]+?GRANT EXECUTE ON FUNCTION public\.match_properties_for_advisor[\s\S]+?;/s,
)?.[0] ?? '';

describe('P5 explainable ranking migration', () => {
  it('keeps organic search active-only, rental-aware, bounded, and deterministic', () => {
    expect(organicFunction).toContain('p.is_active = true');
    expect(organicFunction).toMatch(/p\.listing_type = 'cho_thue' THEN p\.price_per_month ELSE p\.price END/);
    expect(organicFunction).toContain("interval '7 days'");
    expect(organicFunction).toContain("interval '30 days'");
    expect(organicFunction).toContain("interval '90 days'");
    expect(organicFunction).toMatch(/least\([\s\S]+completeness_count/s);
    expect(organicFunction).toMatch(/rank DESC,\s*created_at DESC,\s*id DESC/s);
  });

  it('does not use editorial, traffic, or unevidenced verification flags in relevance', () => {
    const scoreBlock = organicFunction.match(/\) AS rank,[\s\S]*?FROM public\.properties p/)?.[0] ?? '';
    expect(scoreBlock).not.toContain('is_featured');
    expect(scoreBlock).not.toContain('is_hot');
    expect(scoreBlock).not.toContain('is_verified');
    expect(scoreBlock).not.toContain('views');
  });

  it('preserves explicit user sorts and their stable id tie-breakers', () => {
    expect(organicFunction).toMatch(/f_sort, 'relevance'\) = 'price_asc'[\s\S]+id END ASC/s);
    expect(organicFunction).toMatch(/f_sort, 'relevance'\) = 'price_desc'[\s\S]+id END DESC/s);
    expect(organicFunction).toMatch(/f_sort, 'relevance'\) = 'views'[\s\S]+id END DESC/s);
    expect(organicFunction).toMatch(/f_sort, 'relevance'\) = 'newest'[\s\S]+id END DESC/s);
  });

  it('returns advisor intent score plus explainable reason codes', () => {
    expect(advisorFunction).toContain('intent_score integer');
    expect(advisorFunction).toContain('match_reasons text[]');
    expect(advisorFunction).toContain("'location'::text");
    expect(advisorFunction).toContain("'property_type'::text");
    expect(advisorFunction).toContain("'budget'::text");
    expect(advisorFunction).toContain("'near_budget'::text");
    expect(advisorFunction).toContain("'area'::text");
    expect(advisorFunction).toContain("'loan'::text");
    expect(advisorFunction).toContain("'legal'::text");
    expect(advisorFunction).toContain("'keyword'::text");
  });

  it('requires the most-specific requested location instead of matching any broader level', () => {
    expect(advisorFunction).toMatch(/WHEN f_ward IS NOT NULL THEN p\.ward = f_ward[\s\S]+WHEN f_district IS NOT NULL THEN p\.district = f_district[\s\S]+WHEN f_area_id IS NOT NULL THEN p\.area_id = f_area_id/s);
    expect(advisorFunction).not.toMatch(/f_area_id IS NOT NULL AND p\.area_id = f_area_id\)[\s\S]+OR \(f_district/s);
  });

  it('uses monthly rental budget, positive loan support, and a final id tie-breaker', () => {
    expect(advisorFunction).toMatch(/p\.listing_type = 'cho_thue' THEN p\.price_per_month ELSE p\.price END AS effective_price/);
    expect(advisorFunction).toContain('p.loan_support > 0');
    expect(advisorFunction).toMatch(/ORDER BY[\s\S]+intent_score DESC,[\s\S]+keyword_match DESC,[\s\S]+completeness_count DESC,[\s\S]+created_at DESC,[\s\S]+id DESC/s);
  });

  it('keeps hardening and public RPC privileges explicit', () => {
    expect(rankingMigration.match(/SET search_path = public, pg_temp/g)).toHaveLength(2);
    expect(rankingMigration).toContain('REVOKE ALL ON FUNCTION public.search_property_matches(');
    expect(rankingMigration).toContain('REVOKE ALL ON FUNCTION public.match_properties_for_advisor(');
    expect(rankingMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.search_property_matches\([\s\S]+TO anon, authenticated;/s);
    expect(rankingMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.match_properties_for_advisor\([\s\S]+TO anon, authenticated;/s);
  });
});
