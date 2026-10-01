-- =============================================================================
-- Commerce listing approval fee lifecycle for Admin free/paid decisions
-- Pending listings do not reserve money. Approval requires a fee decision.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_owner_user_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  v_fee_mode text;
  v_has_reserved boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.commerce_release_listing_fee_internal(v_listing_id, v_owner_user_id, 'deleted');
    RETURN OLD;
  END IF;

  IF NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT d.fee_mode
      INTO v_fee_mode
      FROM public.commerce_listing_approval_fee_decisions d
     WHERE d.user_listing_id = v_listing_id
     ORDER BY d.approval_cycle DESC, d.approved_at DESC, d.id DESC
     LIMIT 1;

    IF v_fee_mode IS NULL THEN
      RAISE EXCEPTION 'Listing approval fee decision is required.' USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM public.commerce_wallet_fee_reservations r
       WHERE r.user_listing_id = v_listing_id
         AND r.owner_user_id = v_owner_user_id
         AND r.status = 'reserved'
    ) INTO v_has_reserved;

    IF v_fee_mode = 'paid' THEN
      IF NOT v_has_reserved THEN
        RAISE EXCEPTION 'Paid listing approval has no reserved fee.' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.commerce_capture_listing_fee_internal(v_listing_id, v_owner_user_id);
    ELSIF v_has_reserved THEN
      RAISE EXCEPTION 'Free listing approval must release its reserved fee before approval.' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IN ('rejected','expired') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.commerce_release_listing_fee_internal(v_listing_id, v_owner_user_id, NEW.status);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commerce_wallet_listing_fee_lifecycle ON public.user_listings;
CREATE TRIGGER trg_commerce_wallet_listing_fee_lifecycle
  AFTER INSERT OR UPDATE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle();

DROP TRIGGER IF EXISTS trg_commerce_wallet_listing_fee_delete ON public.user_listings;
CREATE TRIGGER trg_commerce_wallet_listing_fee_delete
  BEFORE DELETE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle();

NOTIFY pgrst, 'reload schema';
