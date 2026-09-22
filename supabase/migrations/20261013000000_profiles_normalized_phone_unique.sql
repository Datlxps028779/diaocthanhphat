-- Enforce one account per normalized Vietnamese phone at the database boundary.

DO $$
DECLARE
  duplicate_groups jsonb;
BEGIN
  IF to_regprocedure('public.normalize_vn_phone(text)') IS NULL THEN
    RAISE EXCEPTION 'normalize_vn_phone(text) must exist before phone uniqueness is applied';
  END IF;

  SELECT jsonb_agg(to_jsonb(x) ORDER BY x.normalized_phone)
    INTO duplicate_groups
  FROM (
    SELECT
      public.normalize_vn_phone(phone) AS normalized_phone,
      count(*) AS account_count,
      array_agg(id ORDER BY created_at, id) AS user_ids
    FROM public.profiles
    WHERE NULLIF(public.normalize_vn_phone(phone), '') IS NOT NULL
    GROUP BY public.normalize_vn_phone(phone)
    HAVING count(*) > 1
  ) x;

  IF duplicate_groups IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate normalized profile phones must be resolved first: %', duplicate_groups
      USING ERRCODE = '23505';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_normalized_phone_unique
  ON public.profiles ((public.normalize_vn_phone(phone)))
  WHERE NULLIF(public.normalize_vn_phone(phone), '') IS NOT NULL;

NOTIFY pgrst, 'reload schema';
