-- =============================================================================
-- RPC đổi slug khu dân cư + cascade đồng bộ tin đăng & nội dung đã soạn
-- =============================================================================
-- Slug khu dân cư (neighborhoods.slug) được nhân bản (denormalized) sang cột text
-- properties.neighborhood_slug / user_listings.neighborhood_slug để lọc nhanh, và
-- làm khóa managed_pages/page_blocks 'khu-dan-cu:<slug>' cho nội dung pillar. Khi
-- admin sửa TAY slug, phải cập nhật đồng loạt các bản sao này trong 1 transaction,
-- nếu không: link khu dân cư ở trang chi tiết BĐS mất khớp, trang khu lọc ra 0 tin,
-- và nội dung đã soạn bị mồ côi.

-- page_blocks.page_slug là FK tới managed_pages(slug) và trước đây chỉ ON DELETE
-- CASCADE → đổi managed_pages.slug bị chặn vì các block con còn trỏ key cũ. Thêm
-- ON UPDATE CASCADE để đổi khóa nội dung nguyên tử: chỉ cần đổi managed_pages.slug,
-- các block tự theo sang khóa mới (giữ nguyên nội dung đã soạn).
ALTER TABLE page_blocks DROP CONSTRAINT IF EXISTS page_blocks_page_slug_fkey;
ALTER TABLE page_blocks
  ADD CONSTRAINT page_blocks_page_slug_fkey
  FOREIGN KEY (page_slug) REFERENCES managed_pages(slug)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- SECURITY DEFINER để vượt RLS trên properties/managed_pages nhưng vẫn chặn
-- is_admin() ngay đầu hàm.
CREATE OR REPLACE FUNCTION rename_neighborhood_slug(p_id uuid, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được đổi slug khu dân cư';
  END IF;

  IF p_new IS NULL OR btrim(p_new) = '' THEN
    RAISE EXCEPTION 'Slug mới không được để trống';
  END IF;

  -- Chống trùng: slug mới đã thuộc về một khu khác.
  IF EXISTS (SELECT 1 FROM neighborhoods WHERE slug = p_new AND id <> p_id) THEN
    RAISE EXCEPTION 'Slug "%" đã được dùng cho khu dân cư khác', p_new;
  END IF;

  -- Không đổi thì thôi (tránh cascade thừa).
  IF p_old IS NOT DISTINCT FROM p_new THEN
    RETURN;
  END IF;

  UPDATE neighborhoods SET slug = p_new WHERE id = p_id;
  UPDATE properties    SET neighborhood_slug = p_new WHERE neighborhood_slug = p_old;
  UPDATE user_listings SET neighborhood_slug = p_new WHERE neighborhood_slug = p_old;
  -- Đổi khóa trang nội dung pillar; page_blocks con tự cascade theo (ON UPDATE CASCADE).
  UPDATE managed_pages SET slug = 'khu-dan-cu:' || p_new WHERE slug = 'khu-dan-cu:' || p_old;
END;
$$;

REVOKE ALL ON FUNCTION rename_neighborhood_slug(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION rename_neighborhood_slug(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
