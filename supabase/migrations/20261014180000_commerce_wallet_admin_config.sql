-- =============================================================================
-- Commerce Wallet admin configuration
-- Admin/staff permission gated configuration only. No balance mutation.
-- =============================================================================

INSERT INTO public.staff_permission_catalog(module, action, label)
VALUES
  ('commerce-wallet', 'view', 'Ví & thanh toán'),
  ('commerce-wallet', 'edit', 'Ví & thanh toán')
ON CONFLICT (module, action) DO UPDATE SET label = EXCLUDED.label;

CREATE OR REPLACE FUNCTION public.commerce_admin_get_wallet_configuration()
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

  RETURN jsonb_build_object(
    'config', (
      SELECT to_jsonb(c)
      FROM public.commerce_wallet_topup_config c
      WHERE c.id = true
    ),
    'topupOptions', (
      SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.sort_order, o.amount_minor, o.code), '[]'::jsonb)
      FROM public.commerce_wallet_topup_options o
    ),
    'feeProducts', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.product_kind, p.code, p.version), '[]'::jsonb)
      FROM public.commerce_fee_products p
    ),
    'generatedAt', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_admin_update_wallet_topup_config(
  p_is_active boolean,
  p_custom_amount_enabled boolean,
  p_custom_min_minor bigint DEFAULT NULL,
  p_custom_max_minor bigint DEFAULT NULL,
  p_custom_step_minor bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-wallet', 'edit') THEN
    RAISE EXCEPTION 'Commerce wallet edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Wallet top-up activation is not available in this rollout.' USING ERRCODE = '22023';
  END IF;
  IF p_custom_amount_enabled IS NULL THEN
    RAISE EXCEPTION 'Custom amount setting is required.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commerce_wallet_topup_config', 0));
  IF NOT p_custom_amount_enabled
     AND (p_custom_min_minor IS NOT NULL OR p_custom_max_minor IS NOT NULL OR p_custom_step_minor IS NOT NULL) THEN
    RAISE EXCEPTION 'Custom amount bounds must be empty when custom amount is disabled.' USING ERRCODE = '22023';
  END IF;
  IF p_custom_amount_enabled
     AND (p_custom_min_minor IS NULL OR p_custom_max_minor IS NULL OR p_custom_step_minor IS NULL) THEN
    RAISE EXCEPTION 'Custom amount bounds are required when custom amount is enabled.' USING ERRCODE = '22023';
  END IF;

  IF p_custom_amount_enabled AND (
    p_custom_min_minor <= 0 OR p_custom_max_minor < p_custom_min_minor
    OR p_custom_step_minor <= 0 OR p_custom_step_minor > p_custom_max_minor
    OR p_custom_max_minor > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'Custom amount bounds are invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_custom_amount_enabled AND
     ((p_custom_min_minor + p_custom_step_minor - 1) / p_custom_step_minor) * p_custom_step_minor > p_custom_max_minor THEN
    RAISE EXCEPTION 'Custom amount range contains no valid step multiple.' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(c) INTO v_before
  FROM public.commerce_wallet_topup_config c
  WHERE c.id = true;

  INSERT INTO public.commerce_wallet_topup_config(
    id, is_active, custom_amount_enabled,
    custom_min_minor, custom_max_minor, custom_step_minor,
    updated_by, updated_at
  ) VALUES (
    true, p_is_active, p_custom_amount_enabled,
    p_custom_min_minor, p_custom_max_minor, p_custom_step_minor,
    v_actor, clock_timestamp()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    custom_amount_enabled = EXCLUDED.custom_amount_enabled,
    custom_min_minor = EXCLUDED.custom_min_minor,
    custom_max_minor = EXCLUDED.custom_max_minor,
    custom_step_minor = EXCLUDED.custom_step_minor,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  SELECT to_jsonb(c) INTO v_after
  FROM public.commerce_wallet_topup_config c
  WHERE c.id = true;

  v_actor_role := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
    ELSE 'admin'
  END;

  INSERT INTO public.commerce_audit_events(
    actor_id, actor_role, entity_type, event_type, correlation_id, before_state, after_state
  ) VALUES (
    v_actor, v_actor_role, 'wallet_topup_config', 'commerce_wallet_topup_config_updated',
    'wallet_topup_config', v_before, v_after
  );

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_admin_save_wallet_topup_option(
  p_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_amount_minor bigint DEFAULT NULL,
  p_is_active boolean DEFAULT false,
  p_sort_order integer DEFAULT 0
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
  v_code text := lower(btrim(COALESCE(p_code, '')));
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-wallet', 'edit') THEN
    RAISE EXCEPTION 'Commerce wallet edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9_-]{2,63}$' THEN
    RAISE EXCEPTION 'Top-up option code is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_label IS NULL OR char_length(btrim(p_label)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Top-up option label is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 OR p_amount_minor > 9007199254740991 THEN
    RAISE EXCEPTION 'Top-up option amount is invalid.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.commerce_wallet_topup_options(code, label, amount_minor, is_active, sort_order, updated_at)
    VALUES (v_code, btrim(p_label), p_amount_minor, p_is_active, p_sort_order, clock_timestamp())
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(o) INTO v_before
    FROM public.commerce_wallet_topup_options o
    WHERE o.id = p_id
    FOR UPDATE;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Top-up option not found.' USING ERRCODE = 'P0002';
    END IF;
    IF (v_before->>'code') IS DISTINCT FROM v_code THEN
      RAISE EXCEPTION 'Top-up option code is immutable; create a new option instead.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.commerce_wallet_topup_options o
    SET label = btrim(p_label), amount_minor = p_amount_minor,
        is_active = p_is_active, sort_order = p_sort_order, updated_at = clock_timestamp()
    WHERE o.id = p_id
    RETURNING o.id INTO v_id;
  END IF;

  SELECT to_jsonb(o) INTO v_after
  FROM public.commerce_wallet_topup_options o
  WHERE o.id = v_id;

  v_actor_role := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
    ELSE 'admin'
  END;
  INSERT INTO public.commerce_audit_events(
    actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, before_state, after_state
  ) VALUES (
    v_actor, v_actor_role, 'wallet_topup_option', v_id,
    CASE WHEN v_before IS NULL THEN 'commerce_wallet_topup_option_created' ELSE 'commerce_wallet_topup_option_updated' END,
    v_id::text, v_before, v_after
  );

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_admin_save_fee_product(
  p_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_version integer DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_product_kind text DEFAULT NULL,
  p_amount_minor bigint DEFAULT NULL,
  p_duration_days integer DEFAULT NULL,
  p_placement_code text DEFAULT NULL,
  p_sponsored_label text DEFAULT NULL,
  p_terms_version text DEFAULT NULL,
  p_is_active boolean DEFAULT false,
  p_is_default boolean DEFAULT false,
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
  v_code text := lower(btrim(COALESCE(p_code, '')));
  v_product_kind text := btrim(COALESCE(p_product_kind, ''));
  v_terms_version text := btrim(COALESCE(p_terms_version, ''));
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-wallet', 'edit') THEN
    RAISE EXCEPTION 'Commerce wallet edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9_-]{2,63}$' OR p_version IS NULL OR p_version <= 0 THEN
    RAISE EXCEPTION 'Fee product identity is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 120
     OR p_amount_minor IS NULL OR p_amount_minor <= 0 OR p_amount_minor > 9007199254740991
     OR p_duration_days IS NULL OR p_duration_days <= 0
     OR v_terms_version = '' THEN
    RAISE EXCEPTION 'Fee product fields are invalid.' USING ERRCODE = '22023';
  END IF;
  IF v_product_kind NOT IN ('listing_basic', 'sponsored_addon') THEN
    RAISE EXCEPTION 'Fee product kind is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_is_default AND (NOT p_is_active OR v_product_kind <> 'listing_basic') THEN
    RAISE EXCEPTION 'Only an active listing basic product can be default.' USING ERRCODE = '22023';
  END IF;
  IF p_valid_until IS NOT NULL AND p_valid_from IS NOT NULL AND p_valid_until <= p_valid_from THEN
    RAISE EXCEPTION 'Fee product validity window is invalid.' USING ERRCODE = '22023';
  END IF;
  IF v_product_kind = 'sponsored_addon'
     AND (NULLIF(btrim(COALESCE(p_placement_code, '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_sponsored_label, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'Sponsored fee product placement and label are required.' USING ERRCODE = '22023';
  END IF;
  IF v_product_kind = 'listing_basic' AND (
    NULLIF(btrim(COALESCE(p_placement_code, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_sponsored_label, '')), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Listing basic fee product cannot have sponsored fields.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.commerce_fee_products(
      code, version, name, description, product_kind, amount_minor, duration_days,
      placement_code, sponsored_label, terms_version, is_active, is_default,
      valid_from, valid_until, updated_at
    ) VALUES (
      v_code, p_version, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''), v_product_kind,
      p_amount_minor, p_duration_days,
      NULLIF(btrim(COALESCE(p_placement_code, '')), ''), NULLIF(btrim(COALESCE(p_sponsored_label, '')), ''),
      v_terms_version, p_is_active, p_is_default, p_valid_from, p_valid_until, clock_timestamp()
    ) RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(p) INTO v_before
    FROM public.commerce_fee_products p
    WHERE p.id = p_id
    FOR UPDATE;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Fee product not found.' USING ERRCODE = 'P0002';
    END IF;
    IF (v_before->>'code') IS DISTINCT FROM v_code
       OR (v_before->>'version')::integer IS DISTINCT FROM p_version
       OR v_before->>'product_kind' IS DISTINCT FROM v_product_kind
       OR (v_before->>'amount_minor')::bigint IS DISTINCT FROM p_amount_minor
       OR v_before->>'terms_version' IS DISTINCT FROM v_terms_version THEN
      RAISE EXCEPTION 'Fee identity, amount and terms are immutable; create a new version instead.' USING ERRCODE = '22023';
    END IF;
    IF p_is_default THEN
      UPDATE public.commerce_fee_products SET is_default = false, updated_at = clock_timestamp()
      WHERE product_kind = 'listing_basic' AND is_default = true AND id <> p_id;
    END IF;
    UPDATE public.commerce_fee_products p
    SET name = btrim(p_name), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        duration_days = p_duration_days,
        placement_code = NULLIF(btrim(COALESCE(p_placement_code, '')), ''),
        sponsored_label = NULLIF(btrim(COALESCE(p_sponsored_label, '')), ''),
        is_active = p_is_active, is_default = p_is_default,
        valid_from = p_valid_from, valid_until = p_valid_until,
        updated_at = clock_timestamp()
    WHERE p.id = p_id
    RETURNING p.id INTO v_id;
  END IF;

  SELECT to_jsonb(p) INTO v_after
  FROM public.commerce_fee_products p
  WHERE p.id = v_id;

  v_actor_role := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
    ELSE 'admin'
  END;
  INSERT INTO public.commerce_audit_events(
    actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, before_state, after_state
  ) VALUES (
    v_actor, v_actor_role, 'wallet_fee_product', v_id,
    CASE WHEN v_before IS NULL THEN 'commerce_wallet_fee_product_created' ELSE 'commerce_wallet_fee_product_updated' END,
    v_id::text, v_before, v_after
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_admin_get_wallet_configuration() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_admin_update_wallet_topup_config(boolean, boolean, bigint, bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_admin_save_wallet_topup_option(uuid, text, text, bigint, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_admin_save_fee_product(uuid, text, integer, text, text, text, bigint, integer, text, text, text, boolean, boolean, timestamptz, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_admin_get_wallet_configuration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_admin_update_wallet_topup_config(boolean, boolean, bigint, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_admin_save_wallet_topup_option(uuid, text, text, bigint, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_admin_save_fee_product(uuid, text, integer, text, text, text, bigint, integer, text, text, text, boolean, boolean, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
