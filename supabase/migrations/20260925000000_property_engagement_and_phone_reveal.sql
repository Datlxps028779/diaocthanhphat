-- =============================================================================
-- Listing engagement: durable phone reveal events, secure reveal RPC, aggregates
-- =============================================================================
-- Additive. Production execution is intentionally user-run.
-- Public clients never receive properties.contact_* until the reveal RPC succeeds.

CREATE TABLE IF NOT EXISTS public.property_phone_reveal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  session_hash text NOT NULL CHECK (char_length(session_hash) BETWEEN 32 AND 64),
  day_bucket date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_phone_reveal_session_day
  ON public.property_phone_reveal_events(property_id, session_hash, day_bucket);
CREATE INDEX IF NOT EXISTS idx_property_phone_reveal_property
  ON public.property_phone_reveal_events(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_phone_reveal_lead
  ON public.property_phone_reveal_events(lead_id);

ALTER TABLE public.property_phone_reveal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.property_phone_reveal_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_property_views(row_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.properties
  SET views = COALESCE(views, 0) + 1
  WHERE id = row_id
    AND is_active = true;
$$;

REVOKE ALL ON FUNCTION public.increment_property_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_property_views(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_reveal_property_phone(
  p_property_id uuid,
  p_visitor_phone text,
  p_visitor_name text DEFAULT NULL,
  p_session_key text DEFAULT NULL
)
RETURNS TABLE(revealed_phone text, recorded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text;
  v_name text;
  v_session_hash text;
  v_day_bucket date := CURRENT_DATE;
  v_property_phone text;
  v_lead_id uuid;
BEGIN
  IF NOT public_rate_limit_allow('property_phone_reveal', 10, 60) THEN
    RAISE EXCEPTION 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties
    WHERE id = p_property_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Tin đăng không còn hiển thị.' USING ERRCODE = 'P0002';
  END IF;

  SELECT NULLIF(btrim(p.contact_phone), '')
  INTO v_property_phone
  FROM public.properties p
  WHERE p.id = p_property_id AND p.is_active = true;

  IF v_property_phone IS NULL THEN
    RAISE EXCEPTION 'Tin đăng chưa có số điện thoại liên hệ.' USING ERRCODE = 'P0003';
  END IF;

  v_phone := regexp_replace(COALESCE(p_visitor_phone, ''), '[^0-9]', '', 'g');
  IF left(v_phone, 2) = '84' AND char_length(v_phone) >= 11 THEN
    v_phone := '0' || substr(v_phone, 3);
  END IF;
  IF v_phone !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$' THEN
    RAISE EXCEPTION 'Số điện thoại di động Việt Nam chưa hợp lệ.' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(left(btrim(COALESCE(p_visitor_name, '')), 120), '');
  v_session_hash := md5(
    COALESCE(NULLIF(left(btrim(p_session_key), 200), ''), public.request_client_key())
    || ':' || p_property_id::text
  );

  PERFORM 1
  FROM public.property_phone_reveal_events e
  WHERE e.property_id = p_property_id
    AND e.session_hash = v_session_hash
    AND e.day_bucket = v_day_bucket
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_property_phone, false;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.leads (
      full_name, phone, message, property_id, status, source, user_id
    ) VALUES (
      COALESCE(v_name, 'Khách xem tin'),
      v_phone,
      'Khách yêu cầu hiện số điện thoại tin đăng.',
      p_property_id,
      'new',
      'property_phone_reveal',
      NULL
    )
    RETURNING id INTO v_lead_id;

    INSERT INTO public.property_phone_reveal_events (
      property_id, lead_id, session_hash, day_bucket
    ) VALUES (
      p_property_id, v_lead_id, v_session_hash, v_day_bucket
    );
  EXCEPTION WHEN unique_violation THEN
    PERFORM 1
    FROM public.property_phone_reveal_events e
    WHERE e.property_id = p_property_id
      AND e.session_hash = v_session_hash
      AND e.day_bucket = v_day_bucket
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN QUERY SELECT v_property_phone, false;
    RETURN;
  END;

  RETURN QUERY SELECT v_property_phone, true;
END;
$$;

REVOKE ALL ON FUNCTION public.public_reveal_property_phone(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_reveal_property_phone(uuid, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_property_engagement()
RETURNS TABLE(
  property_id uuid,
  views integer,
  phone_reveals bigint,
  phone_leads bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    COALESCE(p.views, 0),
    COUNT(DISTINCT e.id),
    COUNT(DISTINCT e.lead_id)
  FROM public.user_listings ul
  JOIN public.properties p
    ON p.id = ul.property_id
   AND p.is_active = true
  LEFT JOIN public.property_phone_reveal_events e ON e.property_id = p.id
  WHERE ul.user_id = auth.uid()
    AND ul.status = 'approved'
  GROUP BY p.id, p.views;
$$;

REVOKE ALL ON FUNCTION public.get_my_property_engagement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_property_engagement() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_property_engagement(p_property_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  property_id uuid,
  views integer,
  phone_reveals bigint,
  phone_leads bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được xem thống kê tương tác.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.views, 0),
    COUNT(DISTINCT e.id),
    COUNT(DISTINCT e.lead_id)
  FROM public.properties p
  LEFT JOIN public.property_phone_reveal_events e ON e.property_id = p.id
  WHERE p_property_ids IS NULL OR p.id = ANY(p_property_ids)
  GROUP BY p.id, p.views;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_property_engagement(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_property_engagement(uuid[]) TO authenticated;

-- A property detail agent card may identify the poster, but must not disclose a
-- phone number before public_reveal_property_phone succeeds.
CREATE OR REPLACE FUNCTION public.public_get_property_agent(p_property_id uuid)
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  bio text,
  avatar_url text,
  public_phone text,
  public_zalo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.id, ap.slug, ap.display_name, ap.bio, ap.avatar_url,
         NULL::text AS public_phone, ap.public_zalo
  FROM public.agent_profiles ap
  JOIN public.user_listings ul
    ON ul.user_id = ap.user_id
   AND ul.property_id = p_property_id
   AND ul.status = 'approved'
  JOIN public.properties pr
    ON pr.id = ul.property_id
   AND pr.is_active = true
  WHERE ap.status = 'published'
  ORDER BY ap.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_property_agent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_property_agent(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
