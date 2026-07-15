CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

CREATE OR REPLACE FUNCTION public.property_ai_search_vector(
  p_title text,
  p_address text,
  p_city text,
  p_district text,
  p_ward text,
  p_description text,
  p_legal_status text,
  p_focus_keywords text,
  p_meta_title text,
  p_meta_description text,
  p_tags text[],
  p_amenities text[]
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('simple', public.f_unaccent(concat_ws(' ', p_title, p_address, p_city, p_district, p_ward))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(concat_ws(
      ' ',
      p_legal_status,
      p_focus_keywords,
      replace(coalesce(array_to_string(p_tags, ' '), ''), '-', ' '),
      coalesce(array_to_string(p_amenities, ' '), '')
    ))), 'B') ||
    setweight(to_tsvector('simple', public.f_unaccent(concat_ws(' ', p_description, p_meta_title, p_meta_description))), 'C')
$$;

CREATE INDEX IF NOT EXISTS idx_properties_ai_search_vector
ON public.properties USING gin (
  public.property_ai_search_vector(
    title, address, city, district, ward, description,
    legal_status, focus_keywords, meta_title, meta_description,
    tags, amenities
  )
)
WHERE is_active = true;

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
AS $$
  WITH args AS (
    SELECT
      NULLIF(trim(coalesce(kw, '')), '') AS clean_kw,
      CASE
        WHEN NULLIF(trim(coalesce(kw, '')), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('simple', public.f_unaccent(trim(kw)))
      END AS tsq,
      greatest(1, least(coalesce(f_limit, 20), 50)) AS lim,
      greatest(0, coalesce(f_offset, 0)) AS off
  ),
  matched AS (
    SELECT
      p.id,
      (
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
        END
        + CASE WHEN p.is_verified THEN 0.03 ELSE 0 END
        + CASE WHEN p.is_hot THEN 0.02 ELSE 0 END
        + CASE WHEN p.is_featured THEN 0.01 ELSE 0 END
      ) AS rank,
      p.created_at,
      p.price,
      p.views
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
      AND (f_min_price IS NULL OR p.price >= f_min_price)
      AND (f_max_price IS NULL OR p.price <= f_max_price)
      AND (f_min_area IS NULL OR p.area_sqm >= f_min_area)
      AND (f_max_area IS NULL OR p.area_sqm <= f_max_area)
      AND (f_bedrooms IS NULL OR p.bedrooms >= f_bedrooms)
      AND (f_direction IS NULL OR p.direction = f_direction)
      AND (f_legal IS NULL OR p.legal_status = f_legal)
      AND (f_featured IS NOT TRUE OR p.is_featured = true)
      AND (f_hot IS NOT TRUE OR p.is_hot = true)
  )
  SELECT id, rank, count(*) OVER () AS total_count
  FROM matched
  ORDER BY
    CASE WHEN coalesce(f_sort, 'relevance') = 'price_asc' THEN price END ASC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'price_desc' THEN price END DESC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'views' THEN views END DESC NULLS LAST,
    CASE WHEN coalesce(f_sort, 'relevance') = 'newest' THEN created_at END DESC NULLS LAST,
    rank DESC,
    created_at DESC
  LIMIT (SELECT lim FROM args)
  OFFSET (SELECT off FROM args)
$$;

GRANT EXECUTE ON FUNCTION public.search_property_matches(
  text, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric,
  integer, text, text, boolean, boolean, text, integer, integer
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
