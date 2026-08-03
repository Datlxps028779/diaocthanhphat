// Tính trang kế cho danh sách nối tiếp ("Tải thêm"). Tách khỏi component để test
// được: dev DB ít tin nên nhánh nối trang gần như không chạy khi thao tác tay.
// startPage là trang người dùng đang đứng (deep-link ?page=N vẫn nối tiếp từ đó).
export function nextListingPageParam(
  { startPage, perPage, total, loaded }: { startPage: number; perPage: number; total: number; loaded: number },
): number | undefined {
  const consumed = (startPage - 1) * perPage + loaded;
  if (consumed >= total) return undefined;
  return startPage + Math.ceil(loaded / perPage);
}
