// Edge Function: sync-search-visibility
// Cổng cron DB → Edge. pg_cron (qua pg_net) gọi function này mỗi 30 phút tại
// phút :07 và :37; function xác thực bằng header riêng rồi chuyển tiếp đúng MỘT
// yêu cầu `action: sync` sang route Next của ứng dụng.
//
// Hai cổng hoàn toàn tách biệt:
//   * DB  → Edge : header `x-search-visibility-cron-secret`
//                  so với env SEARCH_VISIBILITY_CRON_SECRET (cổng vào).
//   * Edge → Next : `Authorization: Bearer <SEARCH_VISIBILITY_SYNC_SECRET>`
//                  (cổng ra) — chỉ được phép dùng cho action `sync`.
//
// Cổng vào KHÔNG nhận JWT, anon key hay service-role key. Xác thực sai thì từ
// chối trước khi chạm bất kỳ hạ tầng phía sau.

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

const EDGE_TO_NEXT_URL = "https://chonhaviet.com/api/admin/search-visibility";

/** Độ dài tối thiểu của secret cổng cron, tính theo byte UTF-8. */
export const CRON_SECRET_MIN_BYTES = 32;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-search-visibility-cron-secret",
};

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

/**
 * So sánh secret theo thời gian hằng định để không rò rỉ qua timing.
 * Dùng `node:crypto` (cùng house pattern với route Next) — Deno 2.x KHÔNG còn
 * API so sánh hằng định trên WebCrypto, nên không được dựa vào nó ở đây.
 * `timingSafeEqual` ném RangeError khi độ dài lệch, nên phải chặn trước.
 */
function secretMatches(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(provided, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // OPTIONS vô hại; mọi method khác ngoài POST bị chặn.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const cronSecret = env("SEARCH_VISIBILITY_CRON_SECRET");
  const syncSecret = env("SEARCH_VISIBILITY_SYNC_SECRET");
  // Fail-closed: thiếu cấu hình, hoặc secret cổng cron quá ngắn (dưới 32 byte),
  // thì không gọi hạ tầng phía sau. Ngưỡng này khớp với wrapper trong migration.
  if (!cronSecret || !syncSecret) {
    return json({ error: "Cổng cron chưa được cấu hình đầy đủ." }, 503);
  }
  if (Buffer.byteLength(cronSecret, "utf8") < CRON_SECRET_MIN_BYTES) {
    return json({ error: "Cổng cron chưa được cấu hình đầy đủ." }, 503);
  }

  const provided = req.headers.get("x-search-visibility-cron-secret") ?? "";
  if (!secretMatches(cronSecret, provided)) {
    return json({ error: "Không được phép." }, 401);
  }

  try {
    const response = await fetch(EDGE_TO_NEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ action: "sync" }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      // Không log body thượng nguồn (có thể chứa chi tiết nội bộ).
      console.error("[sync-search-visibility] sync thất bại", response.status);
      return json({ success: false, error: "Không hoàn tất được lượt sync." }, 502);
    }

    const result = await response.json().catch(() => null);
    return json({ success: true, result }, 200);
  } catch (error) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    console.error("[sync-search-visibility] lỗi khi gọi route sync nội bộ:", kind);
    return json({ success: false, error: "Không gọi được route sync nội bộ." }, 502);
  }
});
