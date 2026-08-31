import { corsHeaders } from "../_shared/cors.ts";
import { clientIp, isRateLimited } from "../_shared/ratelimit.ts";
import { callClaude } from "../_shared/anthropic.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const CONTRACT_VERSION = "p10-v1";

type DescriptionInput = {
  keywords: string;
  listingType?: string;
  area?: string;
  price?: string;
};

function responseJson(cors: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...JSON_HEADERS },
  });
}

function boundedOptionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function provenance(input: {
  provider: string;
  model: string | null;
  fields: string[];
  output: string;
}): Record<string, unknown> {
  return {
    kind: "description",
    status: "draft",
    provider: input.provider,
    model: input.model,
    generated_at: new Date().toISOString(),
    input_fields: input.fields,
    contract_version: CONTRACT_VERSION,
    output_fingerprint: fingerprint(input.output),
  };
}

function inputFields(input: DescriptionInput): string[] {
  return [
    input.keywords ? "keywords" : "",
    input.listingType ? "listing_type" : "",
    input.area ? "area" : "",
    input.price ? "price" : "",
  ].filter(Boolean);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return responseJson(cors, { error: "method_not_allowed" }, 405);

  if (isRateLimited(`ai-desc:${clientIp(req)}`, 6, 60_000)) {
    return responseJson(cors, { error: "rate_limited" }, 429);
  }

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return responseJson(cors, { error: "invalid_json" }, 400);
    }
    if (!raw || typeof raw !== "object") return responseJson(cors, { error: "invalid_input" }, 400);

    const body = raw as Record<string, unknown>;
    const keywords = boundedOptionalText(body.keywords, 500);
    if (!keywords) return responseJson(cors, { error: "keywords_required" }, 400);

    const listingTypeValue = boundedOptionalText(body.listingType, 32);
    const listingType = listingTypeValue === "mua_ban" || listingTypeValue === "cho_thue"
      ? listingTypeValue
      : undefined;
    const input: DescriptionInput = {
      keywords,
      listingType,
      area: boundedOptionalText(body.area, 120),
      price: boundedOptionalText(body.price, 80),
    };
    const fields = inputFields(input);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const typeLabel = listingType === "cho_thue" ? "cho thuê" : listingType === "mua_ban" ? "mua bán" : "chưa xác định";
    const prompt = `Bạn là trợ lý soạn bản nháp tin bất động sản bằng tiếng Việt. Chỉ sử dụng đúng dữ kiện được cung cấp trong dữ liệu đầu vào; nếu thiếu dữ kiện thì không được suy đoán. Không khẳng định pháp lý, sổ, quy hoạch, hạ tầng, khoảng cách, tiện ích, lợi nhuận hoặc cam kết giao dịch nếu dữ liệu đầu vào không nêu. Viết 3-4 câu ngắn gọn, không thêm tiêu đề, và ghi rõ đây là nội dung cần người đăng kiểm tra.\n\nTừ khóa/nội dung người đăng cung cấp: "${keywords}"\nLoại tin: ${typeLabel}\nKhu vực: ${input.area ?? "chưa cung cấp"}\nGiá do người đăng nhập: ${input.price ?? "chưa cung cấp"}`;

    let description = "";
    let provider = "deterministic-fallback";
    let model: string | null = null;

    if (anthropicKey) {
      provider = "anthropic";
      model = Deno.env.get("AI_DESCRIPTION_MODEL") || "claude-haiku-4-5";
      description = await callClaude({ model, maxTokens: 300, prompt });
    } else if (openAiKey) {
      provider = "openai";
      model = "gpt-3.5-turbo";
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        description = typeof data.choices?.[0]?.message?.content === "string"
          ? data.choices[0].message.content.trim()
          : "";
      }
    }

    if (!description) {
      provider = "deterministic-fallback";
      model = null;
      description = generateFallbackDescription(input);
    }

    return responseJson(cors, {
      description,
      provenance: provenance({ provider, model, fields, output: description }),
    });
  } catch {
    return responseJson(cors, { error: "internal_error" }, 500);
  }
});

function generateFallbackDescription(input: DescriptionInput): string {
  const subject = input.keywords.charAt(0).toUpperCase() + input.keywords.slice(1);
  const location = input.area ? ` tại ${input.area}` : "";
  const price = input.price ? `, mức giá do người đăng cung cấp là ${input.price}` : "";
  return `${subject}${location}${price}. Đây là bản nháp dựa trên thông tin đã nhập và cần được kiểm tra, bổ sung trước khi gửi tin. Liên hệ để trao đổi thêm thông tin thực tế và lịch xem bất động sản.`;
}
