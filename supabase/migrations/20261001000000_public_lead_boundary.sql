-- P12/P18: make the public lead RPC the only public write boundary.
-- Production execution is intentionally user-run.

DROP POLICY IF EXISTS "public_insert_leads" ON public.leads;
REVOKE INSERT ON TABLE public.leads FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_submit_lead(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_area_interest text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_property_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_budget text DEFAULT NULL,
  p_follow_up_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_user_id uuid;
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF NOT public_rate_limit_allow('lead_insert', 12, 60) THEN
    RAISE EXCEPTION 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' USING ERRCODE = 'P0001';
  END IF;

  IF NULLIF(btrim(COALESCE(p_full_name, '')), '') IS NULL
     OR char_length(btrim(p_full_name)) > 120 THEN
    RAISE EXCEPTION 'Họ tên chưa hợp lệ.' USING ERRCODE = '22023';
  END IF;
  IF left(v_phone, 2) = '84' AND char_length(v_phone) >= 11 THEN
    v_phone := '0' || substr(v_phone, 3);
  END IF;
  IF v_phone !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$' THEN
    RAISE EXCEPTION 'Số điện thoại di động Việt Nam chưa hợp lệ.' USING ERRCODE = '22023';
  END IF;
  IF p_area_interest IS NOT NULL AND char_length(btrim(p_area_interest)) > 200 THEN
    RAISE EXCEPTION 'Khu vực quan tâm quá dài.' USING ERRCODE = '22023';
  END IF;
  IF p_message IS NOT NULL AND char_length(btrim(p_message)) > 4000 THEN
    RAISE EXCEPTION 'Lời nhắn quá dài.' USING ERRCODE = '22023';
  END IF;
  IF p_budget IS NOT NULL AND char_length(btrim(p_budget)) > 200 THEN
    RAISE EXCEPTION 'Ngân sách quá dài.' USING ERRCODE = '22023';
  END IF;
  IF p_source IS NOT NULL AND p_source NOT IN (
    'property_detail_form',
    'property_callback',
    'contact_modal',
    'invest_page',
    'about_page',
    'valuation_page',
    'ai_advisor'
  ) THEN
    RAISE EXCEPTION 'Nguồn lead không hợp lệ.' USING ERRCODE = '22023';
  END IF;
  IF p_follow_up_at IS NOT NULL AND p_source IS DISTINCT FROM 'property_callback' THEN
    RAISE EXCEPTION 'Chỉ yêu cầu gọi lại mới được đặt lịch gọi.' USING ERRCODE = '22023';
  END IF;
  IF p_follow_up_at IS NOT NULL
     AND (p_follow_up_at < now() - interval '5 minutes'
       OR p_follow_up_at > now() + interval '30 days') THEN
    RAISE EXCEPTION 'Thời gian gọi lại nằm ngoài khoảng cho phép.' USING ERRCODE = '22023';
  END IF;

  v_user_id := CASE
    WHEN public.is_user_customer_account(v_actor) THEN v_actor
    ELSE NULL
  END;

  INSERT INTO public.leads (
    id,
    full_name,
    phone,
    area_interest,
    message,
    property_id,
    source,
    budget,
    follow_up_at,
    status,
    note,
    last_activity_at,
    zalo_user_id,
    user_id
  ) VALUES (
    p_id,
    btrim(p_full_name),
    v_phone,
    NULLIF(btrim(p_area_interest), ''),
    NULLIF(btrim(p_message), ''),
    p_property_id,
    p_source,
    NULLIF(btrim(p_budget), ''),
    p_follow_up_at,
    'new',
    NULL,
    NULL,
    NULL,
    v_user_id
  );

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.public_submit_lead(uuid, text, text, text, text, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_submit_lead(uuid, text, text, text, text, uuid, text, text, timestamptz) TO anon, authenticated;

-- Keep the phone-reveal lead linked to an authenticated customer account only.
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
  v_user_id uuid;
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
  v_user_id := CASE
    WHEN public.is_user_customer_account(auth.uid()) THEN auth.uid()
    ELSE NULL
  END;

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
      v_user_id
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

NOTIFY pgrst, 'reload schema';
