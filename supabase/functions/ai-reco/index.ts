import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { clientIp, isRateLimited } from "../_shared/ratelimit.ts";

// ── Kiểu dữ liệu vào ──────────────────────────────────────────────────────────
// profileDigest: hồ sơ sở thích ĐÃ ẨN DANH do FE tính (tên khu vực/loại/loại-tin ưa
// thích + khoảng giá). KHÔNG id thô, KHÔNG lịch sử, KHÔNG PII.
// candidates: pool BĐS THẬT đã lọc sơ bộ (≤20). Chỉ id trong đây mới được AI xếp.
interface Candidate {
  id: string;
  title: string;
  area?: string | null;
  type?: string | null;
  listingType?: string | null;
  price?: number | null;
  priceLabel?: string | null;
  district?: string | null;
}
interface RecoInput {
  profileDigest: {
    areas?: string[];
    types?: string[];
    listingTypes?: string[];
    priceMin?: number | null;
    priceMax?: number | null;
  };
  candidates: Candidate[];
}

const MAX_CANDIDATES = 20;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Hash ổn định cho khóa cache: hồ sơ digest + đúng tập id ứng viên (đã sắp) → SHA-256.
async function cacheKeyOf(input: RecoInput): Promise<string> {
  const ids = input.candidates.map((c) => c.id).sort();
  const payload = JSON.stringify({ d: input.profileDigest, ids });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildSystemPrompt(): string {
  return `Bạn là trợ lý gợi ý bất động sản. Nhiệm vụ: xếp lại thứ tự các tin trong DANH SÁCH ỨNG VIÊN cho khớp nhất với HỒ SƠ SỞ THÍCH, và nêu 1 lý do ngắn cho mỗi tin.

NGUYÊN TẮC BẮT BUỘC (không được vi phạm):
- CHỈ được chọn và xếp lại các id CÓ SẴN trong danh sách ứng viên. TUYỆT ĐỐI KHÔNG tạo id mới, không tạo tin/giá/khu vực không có trong danh sách.
- Mỗi tin kèm 1 lý do NGẮN (≤12 từ) chỉ dựa trên hồ sơ sở thích + thuộc tính có sẵn của tin (khu vực, loại, khoảng giá). KHÔNG bịa số liệu, KHÔNG viện dẫn dữ liệu ngoài.
- Nếu một tin không có cơ sở rõ để ưu tiên, cho lý do trung tính (ví dụ "Phù hợp nhu cầu bạn đang tìm").
- Chỉ trả về JSON thuần theo đúng định dạng yêu cầu, không thêm chữ nào ngoài JSON.`;
}

function buildPrompt(input: RecoInput): string {
  const d = input.profileDigest;
  const priceStr = d.priceMin != null || d.priceMax != null
    ? `${d.priceMin ?? "?"} - ${d.priceMax ?? "?"} tỷ`
    : "không rõ";
  const cand = input.candidates.map((c, i) =>
    `${i + 1}. id=${c.id} | "${c.title}" | khu vực: ${c.area ?? "?"}${c.district ? " / " + c.district : ""} | loại: ${c.type ?? "?"} | hình thức: ${c.listingType === "cho_thue" ? "cho thuê" : "mua bán"} | giá: ${c.priceLabel ?? (c.price != null ? c.price + " tỷ" : "?")}`
  ).join("\n");

  return `HỒ SƠ SỞ THÍCH (suy từ hành vi, đã ẩn danh):
- Khu vực hay quan tâm: ${d.areas?.length ? d.areas.join(", ") : "chưa rõ"}
- Loại BĐS hay quan tâm: ${d.types?.length ? d.types.join(", ") : "chưa rõ"}
- Hình thức: ${d.listingTypes?.length ? d.listingTypes.join(", ") : "chưa rõ"}
- Khoảng giá điển hình: ${priceStr}

DANH SÁCH ỨNG VIÊN (chỉ được xếp trong đây):
${cand}

Hãy trả về JSON thuần là MẢNG các object theo thứ tự ưu tiên giảm dần, mỗi object gồm:
{"id": "<id có trong danh sách>", "reason": "<lý do ngắn ≤12 từ>"}

Chỉ đưa các id thực sự phù hợp (có thể ít hơn tổng số ứng viên). Không thêm text ngoài JSON.`;
}

// Parse + LÀM SẠCH kết quả AI: chỉ giữ id có thật trong candidates (chống bịa id),
// cắt reason, loại trùng. Trả null nếu không parse được → FE tự fallback.
function sanitize(raw: string, candidates: Candidate[]): { id: string; reason: string }[] | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const valid = new Set(candidates.map((c) => c.id));
  const seen = new Set<string>();
  const out: { id: string; reason: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof id !== "string" || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      reason: typeof reason === "string" ? reason.trim().slice(0, 80) : "",
    });
  }
  return out.length ? out : null;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (isRateLimited(`ai-reco:${clientIp(req)}`, 6, 60_000)) {
      return json({ ranked: null, error: "Too many requests" }, 429);
    }
    const input = (await req.json()) as RecoInput;
    if (!input || !Array.isArray(input.candidates) || !input.candidates.length || input.candidates.length > MAX_CANDIDATES) {
      return json({ ranked: null }, 400);
    }
    if (typeof input.profileDigest !== "object" || input.profileDigest === null) return json({ ranked: null }, 400);
    input.candidates = input.candidates.filter((candidate) =>
      typeof candidate?.id === "string" && candidate.id.length <= 64 &&
      typeof candidate.title === "string" && candidate.title.length <= 300,
    );
    if (!input.candidates.length) return json({ ranked: null }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const key = await cacheKeyOf(input);

    // 1) Cache hit còn hạn → trả luôn, không gọi Claude.
    const { data: cached } = await db.from("reco_cache").select("ranked, created_at").eq("cache_key", key).maybeSingle();
    if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
      return json({ ranked: cached.ranked, cached: true });
    }

    // 2) Gọi Claude (nếu có key). Không có key/AI rỗng → ranked:null để FE fallback.
    const answer = await callClaude({
      model: Deno.env.get("AI_RECO_MODEL") || "claude-haiku-4-5",
      maxTokens: 800,
      temperature: 0.2,
      system: buildSystemPrompt(),
      prompt: buildPrompt(input),
    });
    const ranked = sanitize(answer, input.candidates);
    if (!ranked) return json({ ranked: null });

    // 3) Ghi cache (upsert theo key). Lỗi ghi không chặn trả kết quả.
    await db.from("reco_cache").upsert({ cache_key: key, ranked, created_at: new Date().toISOString() });

    return json({ ranked });
  } catch (err) {
    return json({ ranked: null, error: (err as Error).message }, 200);
  }
});
