-- =============================================================================
-- Public callback requests: cho phép form "Gọi lại" đặt follow_up_at an toàn
-- =============================================================================

DROP POLICY IF EXISTS "public_insert_leads" ON leads;
CREATE POLICY "public_insert_leads" ON leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'new'
    AND note IS NULL
    AND last_activity_at IS NULL
    AND zalo_user_id IS NULL
    AND (
      follow_up_at IS NULL
      OR (
        source = 'property_callback'
        AND follow_up_at >= now() - interval '5 minutes'
        AND follow_up_at <= now() + interval '30 days'
      )
    )
  );

NOTIFY pgrst, 'reload schema';
