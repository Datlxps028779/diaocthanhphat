-- Owner-scoped read-only CRM for leads generated from a user's published listings.
-- Production execution is intentionally user-run after local verification.

CREATE INDEX IF NOT EXISTS idx_user_listings_property_owner
  ON public.user_listings(property_id, user_id)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_property_created_at
  ON public.leads(property_id, created_at DESC)
  WHERE property_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_my_listing_leads(
  p_property_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  lead_id uuid,
  property_id uuid,
  property_title text,
  full_name text,
  phone text,
  message text,
  status text,
  source text,
  follow_up_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'user'
  ) THEN
    RAISE EXCEPTION 'Chỉ tài khoản user được xem lead của tin đăng.' USING ERRCODE = '42501';
  END IF;

  IF p_source IS NOT NULL AND p_source NOT IN (
    'property_phone_reveal', 'property_callback', 'property_detail_form',
    'contact_modal', 'invest_page', 'about_page', 'valuation_page', 'ai_advisor'
  ) THEN
    RAISE EXCEPTION 'Nguồn lead không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN (
    'new', 'contacted', 'nurturing', 'viewing', 'negotiating', 'won', 'lost'
  ) THEN
    RAISE EXCEPTION 'Trạng thái lead không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  IF p_limit < 1 OR p_limit > 100 OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'Phân trang lead không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.property_id,
    p.title,
    l.full_name,
    l.phone,
    l.message,
    l.status,
    l.source,
    l.follow_up_at,
    l.created_at
  FROM public.leads l
  JOIN public.user_listings ul
    ON ul.property_id = l.property_id
   AND ul.user_id = auth.uid()
   AND ul.property_id IS NOT NULL
  JOIN public.properties p ON p.id = l.property_id
  WHERE (p_property_id IS NULL OR l.property_id = p_property_id)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_status IS NULL OR l.status = p_status)
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_listing_lead_stats()
RETURNS TABLE (
  property_id uuid,
  property_title text,
  views integer,
  phone_reveals bigint,
  total_leads bigint,
  callback_leads bigint,
  open_leads bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'user'
  ) THEN
    RAISE EXCEPTION 'Chỉ tài khoản user được xem thống kê tin đăng.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH owned_listings AS (
    SELECT DISTINCT ul.property_id
    FROM public.user_listings ul
    WHERE ul.user_id = auth.uid()
      AND ul.property_id IS NOT NULL
  )
  SELECT
    p.id,
    p.title,
    COALESCE(p.views, 0),
    COUNT(DISTINCT e.id),
    COUNT(DISTINCT l.id),
    COUNT(DISTINCT l.id) FILTER (WHERE l.source = 'property_callback'),
    COUNT(DISTINCT l.id) FILTER (WHERE l.status NOT IN ('won', 'lost'))
  FROM owned_listings owned
  JOIN public.properties p ON p.id = owned.property_id
  LEFT JOIN public.leads l ON l.property_id = p.id
  LEFT JOIN public.property_phone_reveal_events e ON e.property_id = p.id
  GROUP BY p.id, p.title, p.views
  ORDER BY p.title ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_listing_leads(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_listing_lead_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_listing_leads(uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_listing_lead_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
