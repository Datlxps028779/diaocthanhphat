-- =============================================================================
-- P3B: nhật ký vòng đời tin đăng bất biến, do database tự ghi
-- =============================================================================
-- Lịch sử bắt đầu từ lúc migration này được cài. Không backfill sự kiện cũ vì
-- created_at/updated_at không chứng minh được ai đã duyệt hoặc thứ tự chuyển trạng thái.

CREATE TABLE IF NOT EXISTS public.user_listing_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  listing_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'submitted', 'approved', 'rejected', 'resubmitted',
    'renewed', 'expired', 'expiry_changed', 'deleted'
  )),
  from_status text CHECK (from_status IS NULL OR from_status IN ('pending', 'approved', 'rejected', 'expired')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('pending', 'approved', 'rejected', 'expired')),
  reason text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('owner', 'staff', 'admin', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_listing_events_listing_time
  ON public.user_listing_lifecycle_events(listing_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_listing_events_owner_time
  ON public.user_listing_lifecycle_events(listing_owner_id, occurred_at DESC);

ALTER TABLE public.user_listing_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_listing_events_team_select" ON public.user_listing_lifecycle_events;
CREATE POLICY "user_listing_events_team_select"
  ON public.user_listing_lifecycle_events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff());

REVOKE ALL ON TABLE public.user_listing_lifecycle_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_listing_lifecycle_events TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_user_listing_lifecycle_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_type text;
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_reason text;
  v_metadata jsonb := '{}'::jsonb;
  v_listing_id uuid;
  v_owner_id uuid;
  v_property_id uuid;
  v_from_status text;
  v_to_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'submitted';
    v_listing_id := NEW.id;
    v_owner_id := NEW.user_id;
    v_property_id := NEW.property_id;
    v_to_status := NEW.status;
  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'deleted';
    -- The audited row no longer exists when an AFTER DELETE trigger inserts the
    -- event, so the FK must be NULL. Keep the former UUID only in controlled
    -- metadata while owner/property/status remain queryable columns.
    v_listing_id := NULL;
    v_owner_id := OLD.user_id;
    v_property_id := OLD.property_id;
    v_from_status := OLD.status;
    v_metadata := jsonb_build_object('deleted_listing_id', OLD.id);
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := CASE
        WHEN NEW.status = 'approved' THEN 'approved'
        WHEN NEW.status = 'rejected' THEN 'rejected'
        WHEN NEW.status = 'expired' THEN 'expired'
        WHEN NEW.status = 'pending' AND OLD.status = 'expired' THEN 'renewed'
        WHEN NEW.status = 'pending' THEN 'resubmitted'
        ELSE NULL
      END;
    ELSIF OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
      v_event_type := 'expiry_changed';
    ELSE
      RETURN NEW;
    END IF;

    IF v_event_type IS NULL THEN
      RETURN NEW;
    END IF;

    v_listing_id := NEW.id;
    v_owner_id := NEW.user_id;
    v_property_id := COALESCE(NEW.property_id, OLD.property_id);
    v_from_status := OLD.status;
    v_to_status := NEW.status;

    IF v_event_type = 'rejected' THEN
      v_reason := NULLIF(btrim(NEW.reject_reason), '');
    END IF;

    IF OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
      v_metadata := jsonb_build_object(
        'old_expires_at', OLD.expires_at,
        'new_expires_at', NEW.expires_at
      );
    END IF;
  END IF;

  IF v_actor_id IS NULL THEN
    v_actor_role := 'system';
  ELSIF public.is_admin() THEN
    v_actor_role := 'admin';
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor_id AND p.role = 'staff'
  ) THEN
    v_actor_role := 'staff';
  ELSIF v_actor_id = v_owner_id THEN
    v_actor_role := 'owner';
  ELSE
    -- An authenticated non-team user must not be attributed as the listing owner.
    -- Existing RLS should prevent this path; fail closed if a policy regresses.
    RAISE EXCEPTION 'Không xác định được vai trò người thực hiện vòng đời tin đăng'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_listing_lifecycle_events (
    listing_id, listing_owner_id, property_id,
    event_type, from_status, to_status, reason,
    actor_id, actor_role, metadata
  ) VALUES (
    v_listing_id, v_owner_id, v_property_id,
    v_event_type, v_from_status, v_to_status, v_reason,
    v_actor_id, v_actor_role, v_metadata
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_user_listing_lifecycle_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_listing_lifecycle_event ON public.user_listings;
CREATE TRIGGER trg_user_listing_lifecycle_event
  AFTER INSERT OR UPDATE OR DELETE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.capture_user_listing_lifecycle_event();

NOTIFY pgrst, 'reload schema';
