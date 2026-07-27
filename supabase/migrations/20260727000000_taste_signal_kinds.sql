-- =============================================================================
-- Nới CHECK kind của user_taste_signals: thêm 'favorite' + 'contact'
-- =============================================================================
-- Engine gợi ý (src/lib/taste.ts) nay thu thêm 2 nguồn ý định mạnh: yêu thích
-- (favorite) và để lại SĐT/liên hệ (contact) — ngoài search/view cũ. Trọng số
-- contact > favorite > view > search. Chỉ giữ thuộc tính suy sở thích, KHÔNG PII.

ALTER TABLE user_taste_signals DROP CONSTRAINT IF EXISTS user_taste_signals_kind_check;
ALTER TABLE user_taste_signals
  ADD CONSTRAINT user_taste_signals_kind_check
  CHECK (kind IN ('search','view','favorite','contact'));

NOTIFY pgrst, 'reload schema';
