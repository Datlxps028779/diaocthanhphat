-- =============================================================================
-- User Saved Searches — lưu bộ lọc tìm kiếm + nền tảng cảnh báo tin mới
-- =============================================================================
-- Cho khách đã đăng nhập lưu điều kiện tìm (filters jsonb) để quay lại nhanh và
-- bật cảnh báo khi có tin khớp. Slice này chỉ là NỀN TẢNG lưu + quản lý; việc
-- gửi thông báo thật (edge function/secret) tách ra slice sau, giống lead drip.
-- RLS owner-scoped auth.uid()=user_id, mirror user_taste_signals / user_favorites.

CREATE TABLE IF NOT EXISTS user_saved_searches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  filters          jsonb NOT NULL DEFAULT '{}',
  alert_enabled    boolean NOT NULL DEFAULT true,
  cadence          text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('instant','daily','weekly')),
  last_notified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_saved_searches_user_created
  ON user_saved_searches(user_id, created_at DESC);

ALTER TABLE user_saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uss_select" ON user_saved_searches;
CREATE POLICY "uss_select" ON user_saved_searches FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uss_insert" ON user_saved_searches;
CREATE POLICY "uss_insert" ON user_saved_searches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uss_update" ON user_saved_searches;
CREATE POLICY "uss_update" ON user_saved_searches FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uss_delete" ON user_saved_searches;
CREATE POLICY "uss_delete" ON user_saved_searches FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
