-- =============================================================================
-- User Favorites - Bảng lưu trữ BĐS yêu thích của người dùng
-- =============================================================================

-- Bảng user_favorites (phân biệt với property_favorites hiện có)
CREATE TABLE IF NOT EXISTS user_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- Index để truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_property_id ON user_favorites(property_id);

-- RLS Policies
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- Chỉ người dùng tương ứng mới xem được favorites của họ
DROP POLICY IF EXISTS "uf_select" ON user_favorites;
CREATE POLICY "uf_select" ON user_favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_insert" ON user_favorites;
CREATE POLICY "uf_insert" ON user_favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_delete" ON user_favorites;
CREATE POLICY "uf_delete" ON user_favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_update" ON user_favorites;
CREATE POLICY "uf_update" ON user_favorites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);