-- =============================================================================
-- Cache kết quả xếp hạng gợi ý bằng AI (ai-reco) — dùng chung theo "gu" khách
-- =============================================================================
-- Lớp AI ranking (Edge Function ai-reco) gọi Claude để xếp lại pool BĐS thật theo
-- hồ sơ hành vi (đã ẩn danh). Gọi Claude tốn phí + latency, mà nhiều khách cùng
-- "gu" (khu vực/loại/khoảng giá) + cùng pool ứng viên sẽ cho kết quả giống nhau →
-- cache theo hash(hồ sơ digest + danh sách id ứng viên) để không gọi lặp lại.
--
-- Chỉ service_role (Edge dùng service key) được đọc/ghi. Khách KHÔNG truy bảng này
-- trực tiếp — họ chỉ nhận kết quả qua Edge Function. RLS bật + không policy cho
-- anon/authenticated ⇒ mặc định chặn hết ở tầng client.

CREATE TABLE IF NOT EXISTS reco_cache (
  cache_key text PRIMARY KEY,
  ranked jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lọc/dọn theo tuổi (TTL) khi đọc và khi quét dọn định kỳ.
CREATE INDEX IF NOT EXISTS reco_cache_created_idx ON reco_cache(created_at);

ALTER TABLE reco_cache ENABLE ROW LEVEL SECURITY;
-- Không tạo policy nào cho anon/authenticated → chỉ service_role (bypass RLS) vào được.

NOTIFY pgrst, 'reload schema';
