-- =============================================================================
-- Fix: cho phép user sửa tin ở MỌI trạng thái, sửa xong buộc về 'pending'
-- =============================================================================
-- Policy cũ: USING (auth.uid() = user_id AND status = 'pending').
-- Vì USING lọc dòng ĐƯỢC PHÉP update, tin đã duyệt/từ chối (status != pending)
-- không lọt qua → UPDATE trúng 0 dòng nhưng KHÔNG báo lỗi → user tưởng đã sửa,
-- admin không thấy tin quay lại hàng chờ duyệt.
--
-- Sửa: USING chỉ kiểm chủ sở hữu (sửa được mọi trạng thái); WITH CHECK buộc dòng
-- SAU KHI sửa phải là 'pending' → user không thể tự duyệt (nâng status),
-- và mọi lần sửa đều đẩy tin về hàng chờ duyệt lại. Khớp updateMyListing (set status='pending').

DROP POLICY IF EXISTS "user_listings_update_own" ON user_listings;
CREATE POLICY "user_listings_update_own" ON user_listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

NOTIFY pgrst, 'reload schema';
