-- Clear only orphaned legacy verification projections.
-- Verification status, scope, timestamps, cases, evidence, and events are unchanged.
BEGIN;

SELECT set_config('app.property_verification_write', 'true', true);

UPDATE public.properties AS p
SET is_verified = false
WHERE p.is_verified IS TRUE
  AND p.verification_status = 'unverified'
  AND cardinality(coalesce(p.verification_scope_codes, '{}'::text[])) = 0
  AND p.verified_at IS NULL
  AND p.verified_until IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.property_verification_cases AS c
    WHERE c.property_id = p.id
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
