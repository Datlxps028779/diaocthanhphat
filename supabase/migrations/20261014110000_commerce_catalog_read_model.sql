-- =============================================================================
-- Commerce server-approved catalog read model
-- =============================================================================

ALTER TABLE public.commerce_package_versions
  ADD COLUMN IF NOT EXISTS is_purchasable boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.commerce_get_catalog()
RETURNS TABLE(
  package_id uuid,
  package_code text,
  package_name text,
  package_description text,
  package_version_id uuid,
  version integer,
  currency text,
  billing_mode text,
  billing_period_days integer,
  unit_amount_minor bigint,
  tax_rate_basis_points integer,
  terms_version text,
  benefits jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    p.code,
    p.name,
    p.description,
    v.id,
    v.version,
    v.currency,
    v.billing_mode,
    v.billing_period_days,
    v.unit_amount_minor,
    v.tax_rate_basis_points,
    v.terms_version,
    v.benefits
  FROM public.commerce_package_versions v
  JOIN public.commerce_packages p ON p.id = v.package_id
  WHERE p.is_active = true
    AND v.status = 'active'
    AND v.is_purchasable = true
    AND (v.valid_from IS NULL OR v.valid_from <= now())
    AND (v.valid_until IS NULL OR v.valid_until > now())
  ORDER BY p.code, v.version DESC;
$$;

REVOKE ALL ON FUNCTION public.commerce_get_catalog() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_get_catalog() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
