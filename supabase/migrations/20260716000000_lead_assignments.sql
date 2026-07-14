-- =============================================================================
-- Đồng phụ trách lead: bảng lead_assignments + siết RLS "mỗi NV chỉ thấy lead mình"
-- =============================================================================
-- Đợt 4.3: thay mô hình gán 1-ô-text (leads.assigned_to) bằng bảng junction keyed
-- theo user_id → NHIỀU nhân viên cùng chăm 1 khách. RLS chặn tận DB: staff chỉ đọc
-- lead mình là thành viên; lead chưa gán → chỉ admin. Đồng-phụ-trách xem/ghi TOÀN BỘ
-- nhật ký. Admin + NV đang phụ trách được thêm/gỡ đồng nghiệp.
--
-- Expand-contract: GIỮ cột leads.assigned_to (deprecated, ngừng ghi) để code cũ đang
-- chạy production không vỡ trong lúc deploy. Drop cột ở migration "contract" sau này.
-- Idempotent.

-- ─── 1. Bảng junction lead ↔ nhân viên ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_la_lead_id ON lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_la_user_id ON lead_assignments(user_id);

-- ─── 2. Helper: user hiện tại có phải thành viên phụ trách lead không ────────────
-- SECURITY DEFINER → bypass RLS của lead_assignments, tránh đệ quy khi policy của
-- leads/lead_activities/lead_assignments gọi lại hàm này.
CREATE OR REPLACE FUNCTION is_lead_member(p_lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lead_assignments
    WHERE lead_id = p_lead AND user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION is_lead_member(uuid) TO authenticated;

-- ─── 3. RLS cho lead_assignments ────────────────────────────────────────────────
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;

-- Xem: admin thấy hết; thành viên thấy các dòng của lead mình phụ trách (→ biết đồng
-- nghiệp cùng chăm). Thành viên xác định qua is_lead_member (không tự tham chiếu RLS).
DROP POLICY IF EXISTS "la_select" ON lead_assignments;
CREATE POLICY "la_select" ON lead_assignments FOR SELECT TO authenticated
  USING (is_admin() OR is_lead_member(lead_id));

-- Thêm: admin, hoặc NV đang phụ trách lead đó (kéo thêm đồng nghiệp vào cùng).
DROP POLICY IF EXISTS "la_insert" ON lead_assignments;
CREATE POLICY "la_insert" ON lead_assignments FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_lead_member(lead_id));

-- Gỡ: admin, hoặc thành viên (gỡ đồng nghiệp / tự rời khỏi lead).
DROP POLICY IF EXISTS "la_delete" ON lead_assignments;
CREATE POLICY "la_delete" ON lead_assignments FOR DELETE TO authenticated
  USING (is_admin() OR is_lead_member(lead_id));

-- ─── 4. Siết RLS leads: staff chỉ thấy lead mình phụ trách ───────────────────────
-- (thay is_admin_or_staff() all-or-nothing bằng per-row is_lead_member).
DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated
  USING (is_admin() OR is_lead_member(id));

DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated
  USING (is_admin() OR is_lead_member(id))
  WITH CHECK (is_admin() OR is_lead_member(id));

-- INSERT thủ công (createLead) vẫn cho admin+staff; app tự thêm creator làm thành
-- viên ngay sau insert để staff thấy lead vừa tạo. Form web anon (public_insert_leads)
-- GIỮ NGUYÊN. DELETE giữ admin-only (auth_delete_leads ở 20260704300000).
DROP POLICY IF EXISTS "admin_insert_leads" ON leads;
CREATE POLICY "admin_insert_leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());

-- ─── 5. Siết RLS lead_activities: đồng-phụ-trách xem/ghi TOÀN BỘ nhật ký ──────────
DROP POLICY IF EXISTS "auth_select_lead_activities" ON lead_activities;
CREATE POLICY "auth_select_lead_activities" ON lead_activities FOR SELECT TO authenticated
  USING (is_admin() OR is_lead_member(lead_id));

DROP POLICY IF EXISTS "auth_insert_lead_activities" ON lead_activities;
CREATE POLICY "auth_insert_lead_activities" ON lead_activities FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_lead_member(lead_id));
-- DELETE giữ admin-only (auth_delete_lead_activities ở 20260714010000).

-- ─── 6. Roster: team đọc được id/tên/role của nhau (cho picker + hiển thị tên) ────
-- Không mở toàn bộ profiles: chỉ hàng role admin/staff, và chỉ khi caller là team.
DROP POLICY IF EXISTS "profiles_select_team" ON profiles;
CREATE POLICY "profiles_select_team" ON profiles FOR SELECT TO authenticated
  USING (is_admin_or_staff() AND role IN ('admin', 'staff'));

-- ─── 7. Backfill: cố khớp assigned_to (tên) → tài khoản ──────────────────────────
-- Tên không khớp display_name/phone nào → bỏ qua (lead thành "chưa gán", đúng chốt).
INSERT INTO lead_assignments (lead_id, user_id)
SELECT l.id, p.id
FROM leads l
JOIN profiles p
  ON btrim(l.assigned_to) <> ''
  AND (p.display_name = btrim(l.assigned_to) OR p.phone = btrim(l.assigned_to))
WHERE l.assigned_to IS NOT NULL
ON CONFLICT (lead_id, user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
