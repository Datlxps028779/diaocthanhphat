-- Wallet closed-rollout hardening.
-- No pricing seed, activation, checkout or balance mutation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'commerce_wallet_topup_config'
      AND c.conname = 'commerce_wallet_topup_config_fixed_only_check'
  ) THEN
    ALTER TABLE public.commerce_wallet_topup_config
      ADD CONSTRAINT commerce_wallet_topup_config_fixed_only_check
      CHECK (
        custom_amount_enabled = false
        AND custom_min_minor IS NULL
        AND custom_max_minor IS NULL
        AND custom_step_minor IS NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'commerce_wallet_topup_options'
      AND c.conname = 'commerce_wallet_topup_options_sort_order_check'
  ) THEN
    ALTER TABLE public.commerce_wallet_topup_options
      ADD CONSTRAINT commerce_wallet_topup_options_sort_order_check
      CHECK (sort_order >= 0);
  END IF;
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
  IF p_custom_amount_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Custom amount is not available in this rollout.' USING ERRCODE = '22023';
  END IF;
  IF p_custom_min_minor IS NOT NULL
     OR p_custom_max_minor IS NOT NULL
     OR p_custom_step_minor IS NOT NULL THEN
    RAISE EXCEPTION 'Custom amount bounds must be empty in this rollout.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('commerce_wallet_topup_config', 0));

  SELECT to_jsonb(c) INTO v_before
  FROM public.commerce_wallet_topup_config c
  WHERE c.id = true;

  INSERT INTO public.commerce_wallet_topup_config(
    id, is_active, custom_amount_enabled,
    custom_min_minor, custom_max_minor, custom_step_minor,
    updated_by, updated_at
  ) VALUES (
    true, false, false, NULL, NULL, NULL, v_actor, clock_timestamp()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_active = false,
    custom_amount_enabled = false,
    custom_min_minor = NULL,
    custom_max_minor = NULL,
    custom_step_minor = NULL,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  SELECT to_jsonb(c) INTO v_after
  FROM public.commerce_wallet_topup_config c
  WHERE c.id = true;

  v_actor_role := CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_actor AND p.role = 'staff'
    ) THEN 'staff'
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
  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'Top-up option sort order is invalid.' USING ERRCODE = '22023';
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
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_actor AND p.role = 'staff'
    ) THEN 'staff'
    ELSE 'admin'
  END;

  INSERT INTO public.commerce_audit_events(
    actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, before_state, after_state
  ) VALUES (
    v_actor, v_actor_role, 'wallet_topup_option', v_id,
    CASE WHEN v_before IS NULL
      THEN 'commerce_wallet_topup_option_created'
      ELSE 'commerce_wallet_topup_option_updated'
    END,
    v_id::text, v_before, v_after
  );

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_get_wallet_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'config', (
      SELECT CASE WHEN c.is_active THEN jsonb_build_object(
        'custom_amount_enabled', c.custom_amount_enabled,
        'custom_min_minor', c.custom_min_minor,
        'custom_max_minor', c.custom_max_minor,
        'custom_step_minor', c.custom_step_minor,
        'currency', 'VND'
      ) ELSE NULL END
      FROM public.commerce_wallet_topup_config c
      WHERE c.id = true
    ),
    'topupOptions', (
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM public.commerce_wallet_topup_config c
        WHERE c.id = true AND c.is_active = true
      ) THEN COALESCE(jsonb_agg(jsonb_build_object(
        'code', o.code,
        'label', o.label,
        'amount_minor', o.amount_minor,
        'currency', o.currency
      ) ORDER BY o.sort_order, o.amount_minor), '[]'::jsonb)
      ELSE '[]'::jsonb END
      FROM public.commerce_wallet_topup_options o
      WHERE o.is_active = true
    ),
    'feeProducts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'version', p.version,
        'name', p.name,
        'description', p.description,
        'product_kind', p.product_kind,
        'amount_minor', p.amount_minor,
        'currency', p.currency,
        'duration_days', p.duration_days,
        'placement_code', p.placement_code,
        'sponsored_label', p.sponsored_label,
        'terms_version', p.terms_version
      ) ORDER BY p.product_kind, p.amount_minor, p.code), '[]'::jsonb)
      FROM public.commerce_fee_products p
      WHERE p.is_active = true
        AND (p.valid_from IS NULL OR p.valid_from <= now())
        AND (p.valid_until IS NULL OR p.valid_until > now())
    ),
    'generatedAt', now()
  )
$$;

REVOKE ALL ON FUNCTION public.commerce_admin_update_wallet_topup_config(boolean, boolean, bigint, bigint, bigint)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_admin_save_wallet_topup_option(uuid, text, text, bigint, boolean, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_get_wallet_catalog()
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.commerce_admin_update_wallet_topup_config(boolean, boolean, bigint, bigint, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_admin_save_wallet_topup_option(uuid, text, text, bigint, boolean, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_get_wallet_catalog()
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
