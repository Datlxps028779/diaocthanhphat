import { corsHeaders } from "../_shared/cors.ts";
import { clientIp, isRateLimited } from "../_shared/ratelimit.ts";
import { callClaude } from "../_shared/anthropic.ts";

// Form đăng tin công khai gọi → siết CORS allowlist + rate-limit theo IP để chống
// spam / đốt ngân sách LLM (không thể bắt đăng nhập vì form mở cho khách).
Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  // Gọi LLM tốn tiền → hạn mức chặt: tối đa 6 request/phút mỗi IP.
  if (isRateLimited(`ai-desc:${clientIp(req)}`, 6, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    const { keywords, listingType, area, price } = await req.json();
    if (!keywords || typeof keywords !== "string" || keywords.length > 500) {
      return new Response(
        JSON.stringify({ error: "keywords is required (chuỗi, tối đa 500 ký tự)" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      const fallback = generateFallbackDescription(keywords, listingType, area, price);
      return new Response(
        JSON.stringify({ description: fallback }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const typeLabel = listingType === "cho_thue" ? "cho thuê" : "bán";
    const prompt = `Bạn là chuyên gia BĐS Việt Nam. Hãy viết một đoạn mô tả tin đăng BĐS chuyên nghiệp, hấp dẫn, SEO-friendly bằng tiếng Việt cho tin ${typeLabel} tại ${area ?? "Bình Dương"} với từ khóa: "${keywords}". Giá: ${price ?? "thỏa thuận"}. Viết 3-4 câu ngắn gọn, thuyết phục, nêu rõ vị trí, ưu điểm và kêu gọi hành động. KHÔNG thêm tiêu đề.`;

    let description = "";

    if (Deno.env.get("ANTHROPIC_API_KEY")) {
      description = await callClaude({
        model: Deno.env.get("AI_DESCRIPTION_MODEL") || "claude-haiku-4-5",
        maxTokens: 300,
        prompt,
      });
    } else if (Deno.env.get("OPENAI_API_KEY")) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        description = data.choices?.[0]?.message?.content ?? "";
      }
    }

    if (!description) {
      description = generateFallbackDescription(keywords, listingType, area, price);
    }

    return new Response(
      JSON.stringify({ description }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

function generateFallbackDescription(keywords: string, listingType?: string, area?: string, price?: string): string {
  const typeLabel = listingType === "cho_thue" ? "cho thuê" : "bán";
  const location = area ?? "Bình Dương";
  const priceStr = price ? `, giá ${price}` : "";
  return `${keywords.charAt(0).toUpperCase() + keywords.slice(1)} tại ${location}${priceStr}. Vị trí thuận tiện, giao thông kết nối tốt, hạ tầng hoàn chỉnh. Pháp lý rõ ràng, sổ sẵn bàn giao ngay. Liên hệ ngay để nhận thông tin chi tiết và đặt lịch xem bất động sản trực tiếp.`;
}
