// Rate limit đơn giản theo IP cho các Edge Function CÔNG KHAI (không thể bắt
// đăng nhập vì form đăng tin / liên hệ mở cho khách). Mục tiêu: thêm ma sát chống
// spam & đốt ngân sách LLM, KHÔNG phải bảo mật tuyệt đối.
//
// Lưu ý giới hạn: bộ nhớ in-memory chỉ tồn tại trong 1 instance đang "ấm"; Supabase
// có thể chạy nhiều instance nên đây là best-effort. Đủ chặn spam ngây thơ; nếu cần
// mạnh hơn thì chuyển sang bảng Postgres hoặc Upstash Redis sau.

const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// Trả true nếu VƯỢT hạn mức (nên chặn). windowMs mặc định 60s, tối đa `max` request.
export function isRateLimited(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  // Dọn bản ghi cũ để Map không phình vô hạn.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return arr.length > max;
}
