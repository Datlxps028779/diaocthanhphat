-- Correct the production title normalizer after dry-run review.
-- This updates only the function used by the existing title triggers.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_listing_title(
  p_title text,
  p_city text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_ward text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text := normalize(COALESCE(p_title, ''), NFC);
  v_first text;
  v_position integer;
  v_phrase text;
  v_case_source text;
  v_token text;
BEGIN
  v_title := regexp_replace(btrim(v_title), '[[:space:]]+', ' ', 'g');
  IF v_title = '' THEN RETURN ''; END IF;

  v_title := regexp_replace(v_title, '\msổ[[:space:]]+h[oòóỏõọ]ng\M', 'sổ hồng', 'gi');
  v_title := regexp_replace(v_title, '\mchính[[:space:]]+chũ\M', 'chính chủ', 'gi');
  v_title := regexp_replace(v_title, '\mphòng[[:space:]]+ngũ\M', 'phòng ngủ', 'gi');
  v_title := regexp_replace(v_title, '\mmăt[[:space:]]+tiền\M', 'mặt tiền', 'gi');
  v_title := regexp_replace(v_title, '\mthổ[[:space:]]+cử\M', 'thổ cư', 'gi');
  v_title := regexp_replace(v_title, '\mLong[[:space:]]+Hoà\M', 'Long Hòa', 'gi');

  v_title := regexp_replace(v_title, '[[:space:]]+([,.;:!?])', '\1', 'g');
  v_title := regexp_replace(v_title, '([,;:!?])([[:alnum:]])', '\1 \2', 'g');
  v_title := regexp_replace(v_title, '([0-9]),[[:space:]]+([0-9])', '\1,\2', 'g');
  v_title := regexp_replace(v_title, '[[:space:]]*/[[:space:]]*', ' / ', 'g');
  v_title := regexp_replace(v_title, '([[:space:]]+[-–—][[:space:]]*|[[:space:]]*[-–—][[:space:]]+)', ' - ', 'g');
  v_title := regexp_replace(v_title, '([!?.,])\1+', '\1', 'g');
  v_title := regexp_replace(v_title, '[[:space:]]+', ' ', 'g');

  v_case_source := btrim(v_title);
  v_title := lower(v_case_source);
  v_first := substring(v_title from '[[:alpha:]]');
  IF v_first IS NOT NULL THEN
    v_position := strpos(v_title, v_first);
    v_title := overlay(v_title placing upper(v_first) from v_position for char_length(v_first));
  END IF;

  v_title := regexp_replace(v_title, '\mtp[[:space:]]*\.[[:space:]]*hcm\M', 'TP.HCM', 'gi');
  v_title := regexp_replace(v_title, '\mbđs\M', 'BĐS', 'gi');
  v_title := regexp_replace(v_title, '\mpccc\M', 'PCCC', 'gi');
  v_title := regexp_replace(v_title, '\mshr\M', 'SHR', 'gi');
  v_title := regexp_replace(v_title, '\mkcn\M', 'KCN', 'gi');
  v_title := regexp_replace(v_title, '\mkdc\M', 'KDC', 'gi');
  v_title := regexp_replace(v_title, '\mubnd\M', 'UBND', 'gi');
  v_title := regexp_replace(v_title, '\mkp([0-9]+)\M', 'KP\1', 'gi');
  v_title := regexp_replace(v_title, '\mql[[:space:]]*([0-9]+)\M', 'QL\1', 'gi');
  v_title := regexp_replace(v_title, '\mpn\M', 'PN', 'gi');
  v_title := regexp_replace(v_title, '\mwc\M', 'WC', 'gi');
  v_title := regexp_replace(v_title, '\mdt\M', 'DT', 'gi');
  v_title := regexp_replace(v_title, '([0-9])tr\M', '\1TR', 'gi');

  FOR v_token IN
    SELECT DISTINCT captured[1]
    FROM regexp_matches(
      v_case_source,
      '\m([[:alnum:].]*[[:alpha:]][[:alnum:].]*[[:digit:]][[:alnum:].]*|[[:alnum:].]*[[:digit:]][[:alnum:].]*[[:alpha:]][[:alnum:].]*)\M',
      'g'
    ) AS matches(captured)
  LOOP
    v_title := replace(v_title, lower(v_token), v_token);
  END LOOP;

  v_title := regexp_replace(v_title, '([0-9]+)M2', '\1m2', 'gi');
  v_title := regexp_replace(v_title, '([0-9]+)M²', '\1m²', 'gi');
  v_title := regexp_replace(v_title, '([0-9]+)M', '\1m', 'gi');
  v_title := regexp_replace(v_title, '([0-9]),[[:space:]]+([0-9])', '\1,\2', 'g');

  FOR v_phrase IN
    SELECT phrase
    FROM unnest(ARRAY[
      p_city, p_district, p_ward,
      'TP. Hồ Chí Minh', 'Thủ Dầu Một', 'Bình Dương', 'Bình Phước', 'Đồng Nai',
      'Dĩ An', 'Thuận An', 'Bến Cát', 'Tân Uyên', 'Chơn Thành', 'Đồng Xoài',
      'An Phú', 'Minh Hưng', 'Lái Thiêu', 'Hưng Định', 'Chợ Búng', 'Bình Chuẩn',
      'Tân Khai', 'Nguyễn Chí Thanh', 'Nguyễn Văn Linh', 'Lê Phong', 'Lê Duẩn',
      'Hàn Quốc', 'Sông Sài Gòn', 'Long Hòa', 'TP. Đồng Nai', 'Becamex'
    ]) AS phrase
    WHERE NULLIF(btrim(phrase), '') IS NOT NULL
    ORDER BY char_length(phrase) DESC
  LOOP
    v_title := replace(v_title, lower(btrim(v_phrase)), btrim(v_phrase));
  END LOOP;

  v_title := regexp_replace(v_title, '[[:space:]]+([,.;:!?])', '\1', 'g');
  v_title := regexp_replace(v_title, '([0-9]),[[:space:]]+([0-9])', '\1,\2', 'g');
  RETURN btrim(v_title);
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_listing_title(text, text, text, text)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
