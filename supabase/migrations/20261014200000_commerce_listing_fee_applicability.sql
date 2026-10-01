-- =============================================================================
-- Commerce listing fee applicability rules
-- Additive only. No fee product or pricing seed.
-- Rules are resolved server-side before an Admin paid approval.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commerce_fee_product_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_product_id uuid NOT NULL REFERENCES public.commerce_fee_products(id) ON DELETE RESTRICT,
  listing_type text NOT NULL CHECK (listing_type IN ('mua_ban', 'cho_thue', 'can_mua', 'can_thue')),
  property_type_id uuid REFERENCES public.property_types(id) ON DELETE RESTRICT,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000000),
  is_active boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  UNIQUE (id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_fee_product_rules_resolve
  ON public.commerce_fee_product_rules(
    listing_type,
    property_type_id,
    is_active,
    priority DESC,
    valid_from,
    valid_until
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_fee_product_rules_broad_priority
  ON public.commerce_fee_product_rules(listing_type, priority)
  WHERE is_active = true AND property_type_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_fee_product_rules_specific_priority
  ON public.commerce_fee_product_rules(listing_type, property_type_id, priority)
  WHERE is_active = true AND property_type_id IS NOT NULL;

ALTER TABLE public.commerce_fee_product_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_fee_product_rules FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.commerce_resolve_listing_fee_product(
  p_user_listing_id uuid,
  p_fee_product_code text
)
RETURNS TABLE (
  rule_id uuid,
  fee_product_id uuid,
  code text,
  version integer,
  name text,
  description text,
  product_kind text,
  amount_minor bigint,
  currency text,
  duration_days integer,
  terms_version text,
  listing_type text,
  property_type_id uuid,
  priority integer,
  rule_specificity text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_listing_id IS NULL OR NULLIF(btrim(COALESCE(p_fee_product_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Listing and fee product code are required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    p.id,
    p.code,
    p.version,
    p.name,
    p.description,
    p.product_kind,
    p.amount_minor,
    p.currency,
    p.duration_days,
    p.terms_version,
    l.listing_type,
    r.property_type_id,
    r.priority,
    CASE WHEN r.property_type_id IS NULL THEN 'listing_type' ELSE 'property_type' END
  FROM public.user_listings l
  JOIN public.commerce_fee_product_rules r
    ON r.listing_type = l.listing_type
   AND (r.property_type_id IS NULL OR r.property_type_id = l.property_type_id)
  JOIN public.commerce_fee_products p
    ON p.id = r.fee_product_id
   AND p.code = lower(btrim(p_fee_product_code))
  WHERE l.id = p_user_listing_id
    AND p.product_kind = 'listing_basic'
    AND p.is_active = true
    AND (p.valid_from IS NULL OR p.valid_from <= clock_timestamp())
    AND (p.valid_until IS NULL OR p.valid_until > clock_timestamp())
    AND r.is_active = true
    AND (r.valid_from IS NULL OR r.valid_from <= clock_timestamp())
    AND (r.valid_until IS NULL OR r.valid_until > clock_timestamp())
  ORDER BY
    (r.property_type_id IS NOT NULL) DESC,
    r.priority DESC,
    p.version DESC,
    r.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No applicable active listing fee product was found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_admin_get_fee_product_rules()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission('commerce-wallet', 'view') THEN
    RAISE EXCEPTION 'Commerce wallet view permission required.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'fee_product_id', r.fee_product_id,
        'fee_product_code', p.code,
        'fee_product_version', p.version,
        'fee_product_name', p.name,
        'product_kind', p.product_kind,
        'amount_minor', p.amount_minor,
        'currency', p.currency,
        'duration_days', p.duration_days,
        'terms_version', p.terms_version,
        'listing_type', r.listing_type,
        'property_type_id', r.property_type_id,
        'priority', r.priority,
        'is_active', r.is_active,
        'valid_from', r.valid_from,
        'valid_until', r.valid_until,
        'created_by', r.created_by,
        'updated_by', r.updated_by,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      )
      ORDER BY r.listing_type, r.property_type_id NULLS FIRST, r.priority DESC, p.code, p.version DESC
    )
    FROM public.commerce_fee_product_rules r
    JOIN public.commerce_fee_products p ON p.id = r.fee_product_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_admin_save_fee_product_rule(
  p_id uuid DEFAULT NULL,
  p_fee_product_id uuid DEFAULT NULL,
  p_listing_type text DEFAULT NULL,
  p_property_type_id uuid DEFAULT NULL,
  p_priority integer DEFAULT 100,
  p_is_active boolean DEFAULT false,
  p_valid_from timestamptz DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_listing_type text := lower(btrim(COALESCE(p_listing_type, '')));
  v_product_kind text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-wallet', 'edit') THEN
    RAISE EXCEPTION 'Commerce wallet edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_fee_product_id IS NULL OR v_listing_type NOT IN ('mua_ban', 'cho_thue', 'can_mua', 'can_thue') THEN
    RAISE EXCEPTION 'Fee product rule identity is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_priority IS NULL OR p_priority NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Fee product rule priority is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_valid_until IS NOT NULL AND p_valid_from IS NOT NULL AND p_valid_until <= p_valid_from THEN
    RAISE EXCEPTION 'Fee product rule validity window is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT p.product_kind
    INTO v_product_kind
    FROM public.commerce_fee_products p
   WHERE p.id = p_fee_product_id
   FOR SHARE;
  IF NOT FOUND OR v_product_kind <> 'listing_basic' THEN
    RAISE EXCEPTION 'Only listing basic fee products can be mapped to listing approval rules.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.commerce_fee_product_rules(
      fee_product_id, listing_type, property_type_id, priority,
      is_active, valid_from, valid_until, created_by, updated_by, updated_at
    ) VALUES (
      p_fee_product_id, v_listing_type, p_property_type_id, p_priority,
      p_is_active, p_valid_from, p_valid_until, v_actor, v_actor, clock_timestamp()
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(r)
      INTO v_before
      FROM public.commerce_fee_product_rules r
     WHERE r.id = p_id
     FOR UPDATE;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Fee product rule not found.' USING ERRCODE = 'P0002';
    END IF;
    IF (v_before->>'fee_product_id')::uuid IS DISTINCT FROM p_fee_product_id
       OR v_before->>'listing_type' IS DISTINCT FROM v_listing_type
       OR (v_before->>'property_type_id')::uuid IS DISTINCT FROM p_property_type_id THEN
      RAISE EXCEPTION 'Fee product rule identity is immutable; create a new rule instead.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.commerce_fee_product_rules r
       SET priority = p_priority,
           is_active = p_is_active,
           valid_from = p_valid_from,
           valid_until = p_valid_until,
           updated_by = v_actor,
           updated_at = clock_timestamp()
     WHERE r.id = p_id
     RETURNING r.id INTO v_id;
  END IF;

  SELECT to_jsonb(r)
    INTO v_after
    FROM public.commerce_fee_product_rules r
   WHERE r.id = v_id;

  v_actor_role := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
    ELSE 'admin'
  END;

  INSERT INTO public.commerce_audit_events(
    actor_id, actor_role, entity_type, entity_id, event_type,
    correlation_id, before_state, after_state
  ) VALUES (
    v_actor, v_actor_role, 'commerce_fee_product_rule', v_id,
    CASE WHEN v_before IS NULL THEN 'commerce_fee_product_rule_created' ELSE 'commerce_fee_product_rule_updated' END,
    v_id::text, v_before, v_after
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_resolve_listing_fee_product(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_admin_get_fee_product_rules() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_admin_save_fee_product_rule(uuid, uuid, text, uuid, integer, boolean, timestamptz, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_admin_get_fee_product_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_admin_save_fee_product_rule(uuid, uuid, text, uuid, integer, boolean, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
