-- P5: organic search và Trợ lý BĐS dùng policy tất định, giải thích được.
-- Cờ editorial (HOT/Nổi bật), lượt xem và boolean xác minh không tham gia relevance.

CREATE OR REPLACE FUNCTION public.search_property_matches(
  kw text DEFAULT NULL,
  f_listing_type text DEFAULT NULL,
  f_area_id uuid DEFAULT NULL,
  f_type_id uuid DEFAULT NULL,
  f_city text DEFAULT NULL,
  f_district text DEFAULT NULL,
  f_ward text DEFAULT NULL,
  f_min_price numeric DEFAULT NULL,
  f_max_price numeric DEFAULT NULL,
  f_min_area numeric DEFAULT NULL,
  f_max_area numeric DEFAULT NULL,
  f_bedrooms integer DEFAULT NULL,
  f_direction text DEFAULT NULL,
  f_legal text DEFAULT NULL,
  f_featured boolean DEFAULT NULL,
  f_hot boolean DEFAULT NULL,
  f_sort text DEFAULT 'relevance',
  f_limit integer DEFAULT 20,
  f_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, rank real, total_count bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH args AS (
    SELECT
      CASE
        WHEN NULLIF(trim(coalesce(kw, '')), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('simple', public.f_unaccent(trim(kw)))
      END AS tsq,
      greatest(1, least(coalesce(f_limit, 20), 50)) AS lim,
      greatest(0, coalesce(f_offset, 0)) AS off
  ),
  candidates AS (
    SELECT
      p.id,
      p.created_at,
      CASE WHEN p.listing_type = 'cho_thue' THEN p.price_per_month ELSE p.price END AS sortable_price,
      p.views,
      CASE
        WHEN a.tsq IS NULL THEN 0::real
        ELSE ts_rank_cd(
          public.property_ai_search_vector(
            p.title, p.address, p.city, p.district, p.ward, p.description,
            p.legal_status, p.focus_keywords, p.meta_title, p.meta_description,
            p.tags, p.amenities
          ),
          a.tsq
        )::real
      END AS text_rank,
      (
        (p.title IS NOT NULL)::int
        + (p.description IS NOT NULL)::int
        + (p.image_url IS NOT NULL)::int
        + ((CASE WHEN p.listing_type = 'cho_thue' THEN p.price_per_month ELSE p.price END) IS NOT NULL)::int
        + (p.area_sqm IS NOT NULL)::int
        + (p.city IS NOT NULL)::int
        + (p.district IS NOT NULL)::int
        + (p.ward IS NOT NULL)::int
        + (p.area_id IS NOT NULL)::int
        + (p.district_id IS NOT NULL)::int
        + (p.property_type_id IS NOT NULL)::int
        + (p.legal_status IS NOT NULL)::int
        + (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)::int
      ) AS completeness_count
    FROM public.properties p
    CROSS JOIN args a
    WHERE p.is_active = true
      AND (
        a.tsq IS NULL OR
        public.property_ai_search_vector(
          p.title, p.address, p.city, p.district, p.ward, p.description,
          p.legal_status, p.focus_keywords, p.meta_title, p.meta_description,
          p.tags, p.amenities
        ) @@ a.tsq
      )
      AND (f_listing_type IS NULL OR p.listing_type = f_listing_type)
      AND (f_area_id IS NULL OR p.area_id = f_area_id)
      AND (f_type_id IS NULL OR p.property_type_id = f_type_id)
      AND (f_city IS NULL OR p.city = f_city)
      AND (f_district IS NULL OR p.district = f_district)
      AND (f_ward IS NULL OR p.ward = f_ward)
      AND (f_min_price IS NULL OR (CASE WHEN p.listing_type = 'cho_thue' THEN p.price_per_month ELSE p.price END) >= f_min_price)
      AND (f_max_price IS NULL OR (CASE WHEN p.listing_type = 'cho_thue' THEN p.price_per_month ELSE p.price END) <= f_max_price)
      AND (f_min_area IS NULL OR p.area_sqm >= f_min_area)
      AND (f_max_area IS NULL OR p.area_sqm <= f_max_area)
      AND (f_bedrooms IS NULL OR p.bedrooms >= f_bedrooms)
      AND (f_direction IS NULL OR p.direction = f_direction)
      AND (f_legal IS NULL OR p.legal_status = f_legal)
      AND (f_featured IS NOT TRUE OR p.is_featured = true)
      AND (f_hot IS NOT TRUE OR p.is_hot = true)
  ),
  ranked AS (
    SELECT
      id,
      (
        text_rank
        + CASE
            WHEN created_at >= now() - interval '7 days' THEN 0.012
            WHEN created_at >= now() - interval '30 days' THEN 0.008
            WHEN created_at >= now() - interval '90 days' THEN 0.004
            ELSE 0
          END
        + least(0.006::real, (completeness_count::real / 13::real) * 0.006::real)
      )::real AS rank,
      created_at,
      sortable_price,
      views
    FROM candidates
  )
  SELECT id, rank, count(*) OVER () AS total_count
  FROM ranked
  ORDER BY
    CASE WHEN coalesce(f_sort, 'relevance') = 'price_asc' THEN sortable_price END ASC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'price_asc' THEN id END ASC,
    CASE WHEN coalesce(f_sort, 'relevance') = 'price_desc' THEN sortable_price END DESC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'price_desc' THEN id END DESC,
    CASE WHEN coalesce(f_sort, 'relevance') = 'views' THEN views END DESC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'views' THEN id END DESC,
    CASE WHEN coalesce(f_sort, 'relevance') = 'newest' THEN created_at END DESC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'newest' THEN id END DESC,
    rank DESC,
    created_at DESC,
    id DESC
  LIMIT (SELECT lim FROM args)
  OFFSET (SELECT off FROM args)
$$;

REVOKE ALL ON FUNCTION public.search_property_matches(
  text, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric,
  integer, text, text, boolean, boolean, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_property_matches(
  text, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric,
  integer, text, text, boolean, boolean, text, integer, integer
) TO anon, authenticated;

-- DROP cần thiết vì PostgreSQL không cho CREATE OR REPLACE thay đổi kiểu RETURNS TABLE.
-- Signature input không đổi nên PostgREST/client vẫn gọi cùng RPC; migration chỉ mở rộng output.
DROP FUNCTION IF EXISTS public.match_properties_for_advisor(
  text, uuid, uuid, text, text, numeric, numeric, boolean, text, text, integer
);

CREATE OR REPLACE FUNCTION public.match_properties_for_advisor(
  f_listing_type text DEFAULT NULL,
  f_area_id uuid DEFAULT NULL,
  f_type_id uuid DEFAULT NULL,
  f_district text DEFAULT NULL,
  f_ward text DEFAULT NULL,
  f_target_price numeric DEFAULT NULL,
  f_target_area numeric DEFAULT NULL,
  f_want_loan boolean DEFAULT NULL,
  f_legal text DEFAULT NULL,
  kw text DEFAULT NULL,
  f_limit integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  score integer,
  intent_score integer,
  match_reasons text[],
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH args AS (
    SELECT
      CASE
        WHEN NULLIF(trim(coalesce(kw, '')), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('simple', public.f_unaccent(trim(kw)))
      END AS tsq,
      greatest(1, least(coalesce(f_limit, 5), 20)) AS lim
  ),
  facts AS (
    SELECT
      p.id,
      p.created_at,
      CASE WHEN p.listing_type = 'cho_thue' THEN p.price_per_month ELSE p.price END AS effective_price,
      (CASE
        WHEN f_ward IS NOT NULL THEN p.ward = f_ward
        WHEN f_district IS NOT NULL THEN p.district = f_district
        WHEN f_area_id IS NOT NULL THEN p.area_id = f_area_id
        ELSE false
      END) AS location_match,
      (f_type_id IS NOT NULL AND p.property_type_id = f_type_id) AS type_match,
      (f_target_area IS NOT NULL AND p.area_sqm IS NOT NULL
        AND p.area_sqm BETWEEN f_target_area * 0.8 AND f_target_area * 1.2) AS area_match,
      (f_want_loan IS TRUE AND p.loan_support > 0) AS loan_match,
      (f_legal IS NOT NULL AND p.legal_status = f_legal) AS legal_match,
      (a.tsq IS NOT NULL AND public.property_ai_search_vector(
        p.title, p.address, p.city, p.district, p.ward, p.description,
        p.legal_status, p.focus_keywords, p.meta_title, p.meta_description,
        p.tags, p.amenities
      ) @@ a.tsq) AS keyword_match,
      (
        (p.title IS NOT NULL)::int
        + (p.description IS NOT NULL)::int
        + (p.image_url IS NOT NULL)::int
        + ((CASE WHEN p.listing_type = 'cho_thue' THEN p.price_per_month ELSE p.price END) IS NOT NULL)::int
        + (p.area_sqm IS NOT NULL)::int
        + (p.city IS NOT NULL)::int
        + (p.district IS NOT NULL)::int
        + (p.ward IS NOT NULL)::int
        + (p.area_id IS NOT NULL)::int
        + (p.district_id IS NOT NULL)::int
        + (p.property_type_id IS NOT NULL)::int
        + (p.legal_status IS NOT NULL)::int
        + (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)::int
      ) AS completeness_count
    FROM public.properties p
    CROSS JOIN args a
    WHERE p.is_active = true
      AND (f_listing_type IS NULL OR p.listing_type = f_listing_type)
  ),
  scored AS (
    SELECT
      id,
      (
        CASE WHEN location_match THEN 30 ELSE 0 END
        + CASE WHEN type_match THEN 25 ELSE 0 END
        + CASE
            WHEN f_target_price IS NULL OR effective_price IS NULL THEN 0
            WHEN effective_price <= f_target_price THEN 20
            WHEN effective_price <= f_target_price * 1.15 THEN 10
            ELSE 0
          END
        + CASE WHEN area_match THEN 10 ELSE 0 END
        + CASE WHEN loan_match THEN 10 ELSE 0 END
        + CASE WHEN legal_match THEN 5 ELSE 0 END
      )::integer AS intent_score,
      keyword_match,
      completeness_count,
      created_at,
      array_remove(ARRAY[
        CASE WHEN location_match THEN 'location'::text END,
        CASE WHEN type_match THEN 'property_type'::text END,
        CASE WHEN f_target_price IS NOT NULL AND effective_price IS NOT NULL AND effective_price <= f_target_price THEN 'budget'::text END,
        CASE WHEN f_target_price IS NOT NULL AND effective_price IS NOT NULL AND effective_price > f_target_price AND effective_price <= f_target_price * 1.15 THEN 'near_budget'::text END,
        CASE WHEN area_match THEN 'area'::text END,
        CASE WHEN loan_match THEN 'loan'::text END,
        CASE WHEN legal_match THEN 'legal'::text END,
        CASE WHEN keyword_match THEN 'keyword'::text END
      ], NULL) AS match_reasons
    FROM facts
  )
  SELECT
    id,
    (intent_score + CASE WHEN keyword_match THEN 4 ELSE 0 END)::integer AS score,
    intent_score,
    match_reasons,
    count(*) OVER () AS total_count
  FROM scored
  WHERE intent_score > 0 OR keyword_match
  ORDER BY
    intent_score DESC,
    keyword_match DESC,
    completeness_count DESC,
    created_at DESC,
    id DESC
  LIMIT (SELECT lim FROM args)
$$;

REVOKE ALL ON FUNCTION public.match_properties_for_advisor(
  text, uuid, uuid, text, text, numeric, numeric, boolean, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_properties_for_advisor(
  text, uuid, uuid, text, text, numeric, numeric, boolean, text, text, integer
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
