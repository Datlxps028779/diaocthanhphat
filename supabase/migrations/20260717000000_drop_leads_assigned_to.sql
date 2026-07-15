-- =============================================================================
-- Contract: bỏ cột leads.assigned_to sau khi đã chuyển sang lead_assignments
-- =============================================================================
-- lead_assignments đã backfill và RLS đã verify. Cột text assigned_to không còn được
-- code ghi/đọc; drop để tránh 2 nguồn sự thật.

DROP POLICY IF EXISTS "public_insert_leads" ON leads;
CREATE POLICY "public_insert_leads" ON leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'new'
    AND note IS NULL
    AND follow_up_at IS NULL
  );

ALTER TABLE leads DROP COLUMN IF EXISTS assigned_to;

NOTIFY pgrst, 'reload schema';
