// Cascade khu vực → quận → phường: đổi cấp cha thì xoá lựa chọn cấp con.
//
// Trước đây dùng cờ "bỏ qua lần chạy đầu", nhưng effect còn chạy lại khi taxonomy
// tải xong (areaId từ '' lên giá trị thật). Lần đó xoá mất district seed từ URL
// khu vực, khiến /mua-ban/binh-duong/thuan-an rụt về /mua-ban/binh-duong.
//
// So sánh giá trị trước/sau là đúng bản chất: chỉ user đổi khu vực mới cần reset.
export function shouldResetChild(prev: string | undefined, next: string): boolean {
  if (prev === undefined) return false;
  if (prev === next) return false;
  // '' → giá trị thật là lúc dữ liệu về muộn, không phải user thao tác.
  if (prev === '') return false;
  return true;
}
