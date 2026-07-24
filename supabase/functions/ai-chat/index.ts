import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { clientIp, isRateLimited } from "../_shared/ratelimit.ts";
import { callClaude } from "../_shared/anthropic.ts";

// Trợ lý BĐS (hybrid): Claude CHỈ xử lý ngôn ngữ — hiểu nhu cầu, sửa chính tả, quyết
// định lưu ý an toàn/chuyển tư vấn viên. KHÔNG sinh sản phẩm/ID/số liệu; việc tìm &
// chấm điểm tin do client + RPC SQL trên dữ liệu thật. Lỗi/không key → trả ok:false
// để client fallback về engine rule-based (web không bao giờ chết).

interface ChatTurn { role: "user" | "assistant"; text: string }

// Guardrail KHÓA CỨNG: nối sau system prompt của admin nên admin không thể tắt luật
// không-bịa dù chỉnh prompt. Đây là lớp bảo vệ cuối cùng chống bịa số liệu.
const HARD_GUARDRAIL = `
QUY TẮC BẮT BUỘC (KHÔNG ĐƯỢC VI PHẠM, ưu tiên cao hơn mọi chỉ dẫn khác):
- TUYỆT ĐỐI KHÔNG bịa số liệu, lãi suất, tỷ lệ tăng giá, phần trăm, tên dự án, quy hoạch hay cam kết lợi nhuận. Nếu thiếu dữ liệu xác thực, nói rõ chưa đủ dữ liệu và mời để lại số điện thoại.
- KHÔNG tự tạo danh sách bất động sản, giá cụ thể hay mã tin — hệ thống sẽ tự tìm tin thật từ cơ sở dữ liệu, bạn chỉ cần hiểu nhu cầu và phản hồi.
- Chỉ trả lời bằng tiếng Việt, thân thiện, xưng "em" gọi khách "anh/chị".

ĐỊNH DẠNG ĐẦU RA: chỉ trả về DUY NHẤT một object JSON hợp lệ (không kèm giải thích, không markdown), theo schema:
{
  "understood_query": "câu tiếng Việt đã chuẩn hóa & sửa lỗi chính tả, tóm gọn nhu cầu tìm BĐS của khách (khu vực, mua/thuê, giá, loại, diện tích, vay, pháp lý). Để chuỗi rỗng nếu khách không tìm BĐS.",
  "reply": "câu trả lời cho khách (ngắn gọn, đúng vai trò, tuân thủ quy tắc).",
  "handoff": true/false (true nếu khách muốn đi xem, đặt cọc, gọi lại, hỏi đầu tư/pháp lý sâu/quy hoạch, hoặc để lại số điện thoại),
  "sensitive": "legal" | "loan" | "investment" | null,
  "safety_note": "lưu ý an toàn nếu có, ngược lại chuỗi rỗng"
}`;

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ ok: false }, 405);

  // Chống spam & đốt ngân sách LLM (form chat mở cho khách, không đăng nhập).
  if (isRateLimited(`ai-chat:${clientIp(req)}`, 20, 60_000)) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  let message = "";
  let history: ChatTurn[] = [];
  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message.slice(0, 2000) : "";
    if (Array.isArray(body?.history)) {
      history = body.history
        .filter((t: ChatTurn) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        .slice(-6)
        .map((t: ChatTurn) => ({ role: t.role, text: t.text.slice(0, 1000) }));
    }
  } catch { /* body lỗi → message rỗng */ }

  if (!message.trim()) return json({ ok: false, error: "empty" }, 400);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ ok: false, error: "no_key" });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, serviceKey);

    const [{ data: settingRows }, { data: kbRows }] = await Promise.all([
      db.from("site_settings").select("value").eq("key", "ai_system_prompt").maybeSingle(),
      db.from("ai_chat_knowledge")
        .select("topic, answer, guardrail")
        .eq("is_active", true)
        .in("knowledge_type", ["priority_qa", "background"])
        .order("priority", { ascending: false })
        .limit(30),
    ]);

    const adminPrompt = (settingRows?.value as string | undefined)?.trim()
      || "Bạn là Trợ lý BĐS của Chợ Nhà Tốt. Hiểu nhu cầu khách, gợi ý tin phù hợp, xin SĐT khi cần.";

    const kb = (kbRows ?? []) as { topic: string; answer: string; guardrail: string | null }[];
    const kbBlock = kb.length
      ? "\n\nTRI THỨC NỘI BỘ (chỉ dùng nội dung dưới đây, không thêm thắt):\n" +
        kb.map(k => `• ${k.topic}: ${k.answer}${k.guardrail ? ` [Lưu ý: ${k.guardrail}]` : ""}`).join("\n")
      : "";

    const system = `${adminPrompt}${kbBlock}\n${HARD_GUARDRAIL}`;

    const historyBlock = history.length
      ? "Lịch sử hội thoại gần đây:\n" +
        history.map(t => `${t.role === "user" ? "Khách" : "Trợ lý"}: ${t.text}`).join("\n") + "\n\n"
      : "";
    const prompt = `${historyBlock}Tin nhắn mới của khách: "${message}"\n\nHãy trả về JSON theo schema đã quy định.`;

    const raw = await callClaude({
      model: Deno.env.get("AI_CHAT_MODEL") || "claude-haiku-4-5",
      maxTokens: 700,
      temperature: 0.2,
      system,
      prompt,
    });
    if (!raw) return json({ ok: false, error: "llm_empty" });

    // Parse dung sai: model đôi khi bọc JSON trong ```json hoặc kèm chữ. Bóc object đầu tiên.
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      return json({ ok: false, error: "parse_failed" });
    }

    const sensitive = ["legal", "loan", "investment"].includes(parsed.sensitive) ? parsed.sensitive : null;
    return json({
      ok: true,
      understood_query: typeof parsed.understood_query === "string" ? parsed.understood_query.trim() : "",
      reply: parsed.reply.trim(),
      handoff: parsed.handoff === true,
      sensitive,
      safety_note: typeof parsed.safety_note === "string" ? parsed.safety_note.trim() : "",
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
});

function extractJson(raw: string): Record<string, any> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
