-- Follow-up hardening for databases that already applied
-- 20260708010000_dashboard_stats_rpc.sql before its authorization update.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền xem thống kê quản trị' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH bounds AS (
      SELECT date_trunc('month', now()) AS start_this_month,
             date_trunc('month', now()) - interval '1 month' AS start_last_month,
             date_trunc('month', now()) - interval '1 microsecond' AS end_last_month
    ),
    prop AS (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE is_active) AS active,
             count(*) FILTER (WHERE is_featured) AS featured,
             count(*) FILTER (WHERE is_hot) AS hot,
             count(*) FILTER (WHERE is_active AND listing_type = 'mua_ban') AS sale,
             count(*) FILTER (WHERE is_active AND listing_type = 'cho_thue') AS rent,
             count(*) FILTER (WHERE created_at >= (SELECT start_this_month FROM bounds)) AS this_month,
             coalesce(sum(views) FILTER (WHERE is_active), 0) AS total_views
      FROM public.properties
    ),
    lead AS (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'new') AS new_leads,
             count(*) FILTER (WHERE created_at >= (SELECT start_this_month FROM bounds)) AS this_month,
             count(*) FILTER (
               WHERE created_at >= (SELECT start_last_month FROM bounds)
                 AND created_at <= (SELECT end_last_month FROM bounds)
             ) AS last_month
      FROM public.leads
    ),
    pending AS (
      SELECT count(*) AS c FROM public.user_listings WHERE status = 'pending'
    ),
    news_pub AS (
      SELECT count(*) AS c FROM public.news WHERE is_published = true
    )
    SELECT jsonb_build_object(
      'totalProperties', prop.total,
      'activeProperties', prop.active,
      'featuredProperties', prop.featured,
      'hotProperties', prop.hot,
      'saleProperties', prop.sale,
      'rentProperties', prop.rent,
      'monthProperties', prop.this_month,
      'totalViews', prop.total_views,
      'totalLeads', lead.total,
      'newLeads', lead.new_leads,
      'monthLeads', lead.this_month,
      'lastMonthLeads', lead.last_month,
      'leadGrowth', CASE WHEN lead.last_month > 0
        THEN round(((lead.this_month - lead.last_month)::numeric / lead.last_month) * 100)
        ELSE 0 END,
      'pendingListings', pending.c,
      'totalNews', news_pub.c
    )
    FROM prop, lead, pending, news_pub
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
