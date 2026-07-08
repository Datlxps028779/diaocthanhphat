-- ============================================================================
-- Sprint 1a: RPC get_dashboard_stats — gộp thống kê admin về 1 call phía DB
-- ----------------------------------------------------------------------------
-- Vấn đề hiện tại (src/lib/api/misc.ts getDashboardStats):
--   • 11 round-trip song song tới PostgREST mỗi lần mở dashboard.
--   • ĐIỂM NÓNG THẬT: 1 câu `.select('views').eq('is_active', true)` KÉO TOÀN BỘ
--     dòng views về client rồi reduce cộng bằng JS. Ở ×5 (hàng nghìn dòng) →
--     tải mạng + RAM client tăng tuyến tính, chậm dần.
--
-- Giải pháp: 1 function SQL đếm + SUM(views) NGAY TRONG DB, trả 1 JSON.
--   → 1 round-trip, SUM chạy trên index, không kéo dữ liệu thô về client.
--
-- An toàn: chỉ THÊM function (OR REPLACE, idempotent). Không sửa/xóa dữ liệu.
-- Bảo mật: SECURITY DEFINER + search_path cố định. Chỉ trả SỐ ĐẾM tổng hợp
--   (không lộ dòng dữ liệu). GRANT cho authenticated (admin đăng nhập gọi).
--
-- ⚠️ THỨ TỰ DEPLOY: áp migration NÀY lên DB TRƯỚC, xác nhận chạy được, RỒI mới
--   push code gọi rpc('get_dashboard_stats'). Code giữ fallback về cách cũ nếu
--   RPC chưa tồn tại → không sập admin khi lệch nhịp.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('month', now())                          AS start_this_month,
      date_trunc('month', now()) - interval '1 month'      AS start_last_month,
      date_trunc('month', now()) - interval '1 microsecond' AS end_last_month
  ),
  prop AS (
    SELECT
      count(*)                                                      AS total,
      count(*) FILTER (WHERE is_active)                             AS active,
      count(*) FILTER (WHERE is_featured)                           AS featured,
      count(*) FILTER (WHERE is_hot)                                AS hot,
      count(*) FILTER (WHERE is_active AND listing_type = 'mua_ban')  AS sale,
      count(*) FILTER (WHERE is_active AND listing_type = 'cho_thue') AS rent,
      count(*) FILTER (WHERE created_at >= (SELECT start_this_month FROM bounds)) AS this_month,
      COALESCE(sum(views) FILTER (WHERE is_active), 0)              AS total_views
    FROM properties
  ),
  lead AS (
    SELECT
      count(*)                                    AS total,
      count(*) FILTER (WHERE status = 'new')      AS new_leads,
      count(*) FILTER (WHERE created_at >= (SELECT start_this_month FROM bounds)) AS this_month,
      count(*) FILTER (
        WHERE created_at >= (SELECT start_last_month FROM bounds)
          AND created_at <= (SELECT end_last_month  FROM bounds)
      )                                           AS last_month
    FROM leads
  ),
  pending AS (
    SELECT count(*) AS c FROM user_listings WHERE status = 'pending'
  ),
  news_pub AS (
    SELECT count(*) AS c FROM news WHERE is_published = true
  )
  SELECT jsonb_build_object(
    'totalProperties',    prop.total,
    'activeProperties',   prop.active,
    'featuredProperties', prop.featured,
    'hotProperties',      prop.hot,
    'saleProperties',     prop.sale,
    'rentProperties',     prop.rent,
    'monthProperties',    prop.this_month,
    'totalViews',         prop.total_views,
    'totalLeads',         lead.total,
    'newLeads',           lead.new_leads,
    'monthLeads',         lead.this_month,
    'lastMonthLeads',     lead.last_month,
    'leadGrowth',         CASE
                            WHEN lead.last_month > 0
                            THEN round(((lead.this_month - lead.last_month)::numeric / lead.last_month) * 100)
                            ELSE 0
                          END,
    'pendingListings',    pending.c,
    'totalNews',          news_pub.c
  )
  FROM prop, lead, pending, news_pub;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;

-- ─── Test nhanh sau khi áp (chạy riêng trong SQL Editor) ────────────────────
-- select get_dashboard_stats();
-- Kỳ vọng: 1 JSON object đủ 15 khóa; totalViews là số (đã SUM phía DB).
