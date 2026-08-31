-- P12: reorder nurture steps atomically in one transaction.
-- Chỉ migration; không tự chạy trên production.

CREATE OR REPLACE FUNCTION public.admin_reorder_nurture_steps(p_step_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_input_count integer;
  v_distinct_count integer;
  v_step_count integer;
  v_matching_count integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền đổi thứ tự bước nurture' USING ERRCODE = '42501';
  END IF;

  IF p_step_ids IS NULL OR cardinality(p_step_ids) = 0 THEN
    RAISE EXCEPTION 'Danh sách bước không được rỗng' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_step_ids) AS requested(step_id)
    WHERE requested.step_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Danh sách bước chứa UUID rỗng' USING ERRCODE = '22023';
  END IF;

  -- Serialize reorder với create/update/delete để toàn bộ danh sách được kiểm tra
  -- trên cùng một snapshot mutation và không tạo sort_order dở dang.
  LOCK TABLE public.nurture_drip_step IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)::integer, count(DISTINCT step_id)::integer
  INTO v_input_count, v_distinct_count
  FROM unnest(p_step_ids) AS requested(step_id);

  SELECT count(*)::integer INTO v_step_count
  FROM public.nurture_drip_step;

  SELECT count(*)::integer INTO v_matching_count
  FROM public.nurture_drip_step
  WHERE id = ANY (p_step_ids);

  IF v_input_count <> v_distinct_count
     OR v_input_count <> v_step_count
     OR v_matching_count <> v_step_count THEN
    RAISE EXCEPTION 'Danh sách bước phải chứa đúng một lần toàn bộ bước hiện có' USING ERRCODE = '22023';
  END IF;

  UPDATE public.nurture_drip_step AS step
  SET sort_order = requested.position - 1,
      updated_at = now()
  FROM unnest(p_step_ids) WITH ORDINALITY AS requested(step_id, position)
  WHERE step.id = requested.step_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reorder_nurture_steps(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_nurture_steps(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
