-- News slug format hardening.
--
-- Prevents newly inserted or updated News rows from introducing malformed
-- public slugs. Existing rows are intentionally not scanned in this migration;
-- NOT VALID keeps deployment safe until a separate read-only audit identifies
-- and resolves all legacy rows. The constraint is still enforced for every new
-- row and every subsequent update.
--
-- This migration does not repair existing data, change publication state, call
-- Google, call AI, read RAG, or invoke a worker.

BEGIN;

-- Keep the database-side generator safe too. The old implementation trimmed
-- separators before the length limit, which could expose a trailing separator
-- after substring().
CREATE OR REPLACE FUNCTION public.generate_slug(title text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(title, ''));
  s := translate(s,
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
  s := regexp_replace(s, '[^a-z0-9\s-]', '', 'g');
  s := regexp_replace(s, '\s+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  s := regexp_replace(substring(s, 1, 80), '-+$', '', 'g');
  IF s = '' THEN s := 'bat-dong-san'; END IF;
  RETURN s;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS r ON r.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'news'
      AND c.conname = 'news_slug_format'
  ) THEN
    ALTER TABLE public.news
      ADD CONSTRAINT news_slug_format CHECK (
        (
          is_published IS TRUE
          AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        )
        OR (
          is_published IS NOT TRUE
          AND (
            slug IS NULL
            OR slug = ''
            OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
          )
        )
      ) NOT VALID;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
