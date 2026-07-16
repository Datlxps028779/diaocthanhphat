-- =============================================================================
-- User Taste Signals — đồng bộ tín hiệu sở thích theo TÀI KHOẢN (đa thiết bị)
-- =============================================================================
-- Engine gợi ý (src/lib/taste.ts) học sở thích từ tín hiệu hành vi (search/view).
-- Trước đây chỉ lưu localStorage (mất khi đổi máy/xóa cache). Bảng này lưu tín hiệu
-- cho user đã đăng nhập để hợp nhất với localStorage → gợi ý bám theo tài khoản.
-- Chỉ giữ thuộc tính suy sở thích, KHÔNG PII. RLS owner-scoped auth.uid()=user_id.

CREATE TABLE IF NOT EXISTS user_taste_signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('search','view')),
  area_id      uuid,
  type_id      uuid,
  listing_type text,
  price        numeric,
  ts           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_taste_signals_user_ts ON user_taste_signals(user_id, ts DESC);

ALTER TABLE user_taste_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uts_select" ON user_taste_signals;
CREATE POLICY "uts_select" ON user_taste_signals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uts_insert" ON user_taste_signals;
CREATE POLICY "uts_insert" ON user_taste_signals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uts_delete" ON user_taste_signals;
CREATE POLICY "uts_delete" ON user_taste_signals FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
