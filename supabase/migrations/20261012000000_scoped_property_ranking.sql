-- Extend the existing organic ranking policy with route-authoritative locality filters.
-- Apply this migration before deploying a caller that supplies the new arguments.
DROP FUNCTION IF EXISTS public.search_property_matches(
  text, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric,
  integer, text, text, boolean, boolean, text, integer, integer
);

CREATE FUNCTION public.search_property_matches(
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
  f_offset integer DEFAULT 0,
  f_district_id uuid DEFAULT NULL,
  f_ward_id uuid DEFAULT NULL,
  f_type_ids uuid[] DEFAULT NULL,
  f_sale_min_vnd numeric DEFAULT NULL,
  f_sale_max_vnd numeric DEFAULT NULL
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
      AND (f_district_id IS NULL OR p.district_id = f_district_id)
      AND (f_ward_id IS NULL OR p.ward_id = f_ward_id)
      AND (f_type_ids IS NULL OR p.property_type_id = ANY(f_type_ids))
      AND (
        f_sale_min_vnd IS NULL OR (
          p.listing_type = 'mua_ban' AND p.price > 0
          AND CASE p.price_unit
            WHEN 'tỷ' THEN p.price * 1000000000
            WHEN 'triệu' THEN p.price * 1000000
            ELSE NULL
          END >= f_sale_min_vnd
        )
      )
      AND (
        f_sale_max_vnd IS NULL OR (
          p.listing_type = 'mua_ban' AND p.price > 0
          AND CASE p.price_unit
            WHEN 'tỷ' THEN p.price * 1000000000
            WHEN 'triệu' THEN p.price * 1000000
            ELSE NULL
          END < f_sale_max_vnd
        )
      )
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
  integer, text, text, boolean, boolean, text, integer, integer,
  uuid, uuid, uuid[], numeric, numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_property_matches(
  text, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric,
  integer, text, text, boolean, boolean, text, integer, integer,
  uuid, uuid, uuid[], numeric, numeric
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
