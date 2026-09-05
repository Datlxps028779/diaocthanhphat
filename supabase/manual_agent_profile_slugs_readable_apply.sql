-- Manual production apply: chuẩn hóa slug toàn bộ agent_profiles với mã ID ổn định.
-- Chỉ chạy sau khi dry-run trả về SAFE_TO_UPDATE/NO_CHANGE cho mọi dòng.
-- Chạy migration 20261007000000_agent_profile_random_slug_ids.sql,
-- 20261008000000_agent_profile_slug_one_time_change.sql và
-- 20261009000000_agent_profile_slug_helper_nullable.sql trước.
-- Người dùng phải thay OPERATOR_ADMIN_PROFILE_ID bằng ID admin thực hiện thao tác.
-- Không chạy bởi assistant.

BEGIN;

SELECT set_config(
  'app.agent_profile_audit_actor',
  '40e96dc2-ddf9-4644-a794-8567179e23ea',
  true
);

DO $$
DECLARE
  v_actor_text text := NULLIF(current_setting('app.agent_profile_audit_actor', true), '');
  v_actor_id uuid;
  v_unsafe_count integer;
  v_changed_count integer;
BEGIN
  IF v_actor_text IS NULL OR v_actor_text = 'OPERATOR_ADMIN_PROFILE_ID' THEN
    RAISE EXCEPTION 'Hãy thay OPERATOR_ADMIN_PROFILE_ID bằng UUID admin thực hiện thao tác';
  END IF;
  BEGIN
    v_actor_id := v_actor_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'OPERATOR_ADMIN_PROFILE_ID phải là UUID hợp lệ';
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_actor_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Audit actor phải là profile admin hợp lệ';
  END IF;

  CREATE TEMP TABLE agent_profile_slug_backfill_plan ON COMMIT DROP AS
  SELECT
    ap.id,
    ap.slug AS current_slug,
    ap.slug_change_count,
    public.agent_profile_slug_for_id(NULL, ap.display_name, ap.id) AS proposed_slug
  FROM public.agent_profiles ap;

  SELECT count(*) INTO v_unsafe_count
  FROM agent_profile_slug_backfill_plan plan
  WHERE plan.current_slug <> plan.proposed_slug
    AND (
      plan.slug_change_count >= 1
      OR EXISTS (
        SELECT 1
        FROM agent_profile_slug_backfill_plan duplicate_plan
        WHERE duplicate_plan.proposed_slug = plan.proposed_slug
          AND duplicate_plan.id <> plan.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.agent_profiles other
        WHERE other.slug = plan.proposed_slug
          AND other.id <> plan.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.agent_profile_slug_aliases alias_row
        WHERE alias_row.old_slug = plan.proposed_slug
          AND alias_row.agent_profile_id <> plan.id
      )
    );

  IF v_unsafe_count > 0 THEN
    RAISE EXCEPTION 'Có % dòng không an toàn; dừng trước khi UPDATE', v_unsafe_count;
  END IF;

  SELECT count(*) INTO v_changed_count
  FROM agent_profile_slug_backfill_plan
  WHERE current_slug <> proposed_slug;

  INSERT INTO public.agent_profile_slug_aliases (old_slug, agent_profile_id)
  SELECT current_slug, id
  FROM agent_profile_slug_backfill_plan
  WHERE current_slug <> proposed_slug
  ON CONFLICT (old_slug) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id;

  UPDATE public.agent_profiles ap
  SET slug = plan.proposed_slug,
      updated_at = now()
  FROM agent_profile_slug_backfill_plan plan
  WHERE ap.id = plan.id
    AND ap.slug = plan.current_slug
    AND plan.current_slug <> plan.proposed_slug
    AND plan.slug_change_count = 0;

  IF NOT EXISTS (
    SELECT 1
    FROM agent_profile_slug_backfill_plan plan
    JOIN public.agent_profiles ap ON ap.id = plan.id
    WHERE ap.slug <> plan.proposed_slug
  ) THEN
    RAISE NOTICE 'Đã chuẩn hóa % hồ sơ; actor audit=%', v_changed_count, v_actor_id;
  ELSE
    RAISE EXCEPTION 'Hậu kiểm trong transaction thất bại; rollback';
  END IF;
END $$;

COMMIT;

SELECT
  ap.id AS profile_id,
  ap.slug,
  ap.display_name,
  count(*) OVER (PARTITION BY ap.slug) AS slug_count
FROM public.agent_profiles ap
ORDER BY ap.slug;
