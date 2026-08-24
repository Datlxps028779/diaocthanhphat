-- Chuẩn hóa giải thưởng/chứng nhận trang Về chúng tôi thành collection có nguồn xác minh.
-- Không tự bịa URL nguồn cho dữ liệu cũ: các mục legacy chỉ được giữ như bản nháp admin,
-- và frontend chỉ công bố mục đã có title + source_url HTTP(S).

DO $$
DECLARE
  current_value text;
  current_type text;
  parsed_collection jsonb;
  normalized_items jsonb := '[]'::jsonb;
BEGIN
  SELECT value, type INTO current_value, current_type
  FROM public.page_blocks
  WHERE page_slug = 'about' AND section = 'awards' AND key = 'items'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF current_type = 'collection' THEN
    BEGIN
      parsed_collection := current_value::jsonb;
      IF jsonb_typeof(parsed_collection) = 'object' AND jsonb_typeof(parsed_collection -> 'items') = 'array' THEN
        normalized_items := (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN NULLIF(btrim(item ->> 'title'), '') IS NOT NULL THEN item
              WHEN NULLIF(btrim(item ->> 'text'), '') IS NOT NULL THEN (item - 'text') || jsonb_build_object('title', btrim(item ->> 'text'), 'source_url', COALESCE(item -> 'source_url', '""'::jsonb))
              ELSE item
            END
            ORDER BY ordinal
          ), '[]'::jsonb)
          FROM jsonb_array_elements(parsed_collection -> 'items') WITH ORDINALITY AS entries(item, ordinal)
        );
      ELSIF jsonb_typeof(parsed_collection) = 'array' THEN
        normalized_items := parsed_collection;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      normalized_items := '[]'::jsonb;
    END;
  ELSIF btrim(current_value) <> '' THEN
    normalized_items := (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('title', btrim(line), 'source_url', '') ORDER BY ordinal),
        '[]'::jsonb
      )
      FROM regexp_split_to_table(replace(current_value, E'\r', ''), E'\n') WITH ORDINALITY AS lines(line, ordinal)
      WHERE btrim(line) <> ''
    );
  END IF;

  UPDATE public.page_blocks
  SET
    label = 'Giải thưởng và chứng nhận',
    type = 'collection',
    value = jsonb_build_object('version', 1, 'items', normalized_items)::text,
    updated_at = now()
  WHERE page_slug = 'about' AND section = 'awards' AND key = 'items';
END $$;
