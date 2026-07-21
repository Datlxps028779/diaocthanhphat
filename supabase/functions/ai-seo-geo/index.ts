import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyAdmin } from "../_shared/cors.ts";
import { isRateLimited } from "../_shared/ratelimit.ts";

// Admin-only: sinh DRAFT SEO/GEO/AEO cho property/news/area/route bằng Claude.
// KHÔNG ghi DB — chỉ trả draft + warnings để admin duyệt/sửa rồi tự lưu bằng flow hiện có.

const SEO_ROUTE_PATHS = [
  "/", "/danh-sach", "/mua-ban", "/cho-thue", "/khu-vuc", "/tin-tuc",
  "/ve-chung-toi", "/so-sanh", "/dinh-gia", "/du-an", "/dau-tu",
];

const MODEL = "claude-opus-4-8";

type TargetType = "property" | "news" | "area" | "route";

const DRAFT_TOOL = {
  name: "emit_seo_geo_draft",
  description: "Trả về draft SEO/GEO/AEO đã soạn theo dữ liệu thật.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      meta_title: { type: "string", description: "Tiêu đề SEO 45-65 ký tự, mô tả đúng nội dung." },
      meta_description: { type: "string", description: "Meta description 120-160 ký tự, tự nhiên." },
      focus_keywords: { type: "string", description: "Các nhóm từ khóa ngăn cách bằng dấu phẩy." },
      geo_area: { type: "string", description: "Chỉ cho news: khu vực địa lý thật (tỉnh/huyện/phường)." },
      geo_entity: { type: "string", description: "Chỉ cho news: entity/chủ thể chính có thật." },
      geo_notes: { type: "string", description: "Chỉ cho news: ghi chú GEO/AEO có thể chỉnh sửa." },
      schema_markup: { type: "object", description: "JSON-LD schema.org object khớp nội dung hiển thị." },
      aeo_notes: { type: "array", items: { type: "string" }, description: "Gợi ý câu trả lời/AEO cho admin." },
      warnings: { type: "array", items: { type: "string" }, description: "Cảnh báo khi dữ liệu thiếu, thay vì bịa." },
    },
    required: ["meta_title", "meta_description", "focus_keywords", "schema_markup"],
  },
};

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function buildPrompt(targetType: TargetType, record: Record<string, unknown>, siteSettings: Record<string, string>): string {
  const rules = `Bạn là chuyên gia SEO/GEO/AEO bất động sản Việt Nam. Soạn draft metadata cho nội dung dưới đây theo chuẩn nghiêm ngặt:
- Viết tiếng Việt tự nhiên, KHÔNG nhồi từ khóa, KHÔNG clickbait.
- meta_title khoảng 45-65 ký tự; meta_description khoảng 120-160 ký tự.
- CHỈ dùng dữ liệu thật có trong record/site. TUYỆT ĐỐI không bịa giá, pháp lý, giấy phép, chủ đầu tư, tọa độ, tiện ích, quy hoạch, số liệu thị trường.
- Ưu tiên địa danh thật: tỉnh/thành, quận/huyện, phường/xã, tuyến đường, khu vực.
- schema_markup phải là JSON-LD object schema.org khớp nội dung ĐANG hiển thị; không tạo FAQPage/Review/AggregateRating nếu nội dung tương ứng không hiển thị công khai.
- Nếu thiếu dữ liệu để làm tốt một trường, hãy thêm cảnh báo vào "warnings" thay vì bịa.
- aeo_notes chỉ là gợi ý cho admin, không phải schema.`;

  const entity = `Thông tin doanh nghiệp/khu vực phục vụ (site): khu vực phục vụ="${siteSettings.geo_area_served ?? ""}", chuyên môn="${siteSettings.knows_about ?? ""}", tên pháp lý="${siteSettings.organization_legal_name ?? ""}".`;

  const scope: Record<TargetType, string> = {
    property: 'Loại nội dung: TIN BẤT ĐỘNG SẢN. Sinh meta_title, meta_description, focus_keywords, schema_markup (RealEstateListing hoặc Residence/Place khớp dữ liệu).',
    news: 'Loại nội dung: BÀI VIẾT TIN TỨC. Sinh meta_title, meta_description, focus_keywords, geo_area, geo_entity, geo_notes, schema_markup (NewsArticle/Article). GEO phải là địa danh/entity thật trong bài.',
    area: 'Loại nội dung: TRANG KHU VỰC. Sinh meta_title, meta_description, focus_keywords, schema_markup (CollectionPage/Place khớp khu vực).',
    route: 'Loại nội dung: TRANG TĨNH/DANH MỤC. Sinh meta_title, meta_description, focus_keywords, schema_markup (WebPage/CollectionPage khớp mục đích trang). Không bịa danh sách/số liệu.',
  };

  return `${rules}\n\n${entity}\n\n${scope[targetType]}\n\nDữ liệu record (JSON):\n${JSON.stringify(record, null, 2)}\n\nGọi tool emit_seo_geo_draft với draft đã soạn.`;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  const adminId = await verifyAdmin(req, createClient);
  if (!adminId) {
    return json({ error: "Unauthorized" }, 401, cors);
  }

  // Gọi LLM tốn tiền → siết hạn mức theo admin.
  if (isRateLimited(`ai-seo-geo:${adminId}`, 10, 60_000)) {
    return json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." }, 429, cors);
  }

  let body: { targetType?: TargetType; targetId?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400, cors);
  }

  const { targetType, targetId, path } = body;
  if (!targetType || !["property", "news", "area", "route"].includes(targetType)) {
    return json({ error: "targetType không hợp lệ." }, 400, cors);
  }
  if (targetType === "route") {
    if (!path || !SEO_ROUTE_PATHS.includes(path)) {
      return json({ error: "path không nằm trong danh sách route cho phép." }, 400, cors);
    }
  } else if (!targetId) {
    return json({ error: "targetId là bắt buộc cho property/news/area." }, 400, cors);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "Chưa cấu hình ANTHROPIC_API_KEY cho AI draft." }, 503, cors);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Site entity/GEO settings dùng chung.
    const { data: settingsRows } = await db.from("site_settings").select("key,value").eq("group_name", "schema");
    const siteSettings: Record<string, string> = Object.fromEntries((settingsRows ?? []).map((r: { key: string; value: string | null }) => [r.key, r.value ?? ""]));

    let record: Record<string, unknown> = {};
    if (targetType === "property") {
      const { data, error } = await db.from("properties")
        .select("title,description,listing_type,price,price_unit,price_label,area_sqm,address,city,district,ward,legal_status,bedrooms,bathrooms,slug")
        .eq("id", targetId).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Không tìm thấy bất động sản." }, 404, cors);
      record = data;
    } else if (targetType === "news") {
      const { data, error } = await db.from("news")
        .select("title,excerpt,content,category,author,slug,geo_area,geo_entity,geo_notes")
        .eq("id", targetId).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Không tìm thấy bài viết." }, 404, cors);
      record = data;
    } else if (targetType === "area") {
      const { data, error } = await db.from("areas")
        .select("name,description,slug")
        .eq("id", targetId).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Không tìm thấy khu vực." }, 404, cors);
      record = data;
    } else {
      record = { path };
    }

    const prompt = buildPrompt(targetType, record, siteSettings);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        tools: [DRAFT_TOOL],
        tool_choice: { type: "tool", name: DRAFT_TOOL.name },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("[ai-seo-geo] Anthropic error:", resp.status, detail);
      return json({ error: "AI service lỗi, vui lòng thử lại sau." }, 502, cors);
    }

    const data = await resp.json();
    if (data.stop_reason === "max_tokens") {
      return json({ error: "AI output bị cắt (max tokens), thử lại." }, 502, cors);
    }
    if (data.stop_reason === "refusal") {
      return json({ error: "AI từ chối tạo nội dung cho yêu cầu này." }, 422, cors);
    }

    const toolUse = (data.content ?? []).find((b: { type: string; name?: string }) => b.type === "tool_use" && b.name === DRAFT_TOOL.name);
    if (!toolUse?.input) {
      return json({ error: "AI không trả về draft hợp lệ." }, 502, cors);
    }

    const input = toolUse.input as Record<string, unknown>;
    const warnings = Array.isArray(input.warnings) ? input.warnings : [];
    const draft: Record<string, unknown> = {
      meta_title: input.meta_title ?? "",
      meta_description: input.meta_description ?? "",
      focus_keywords: input.focus_keywords ?? "",
      schema_markup: input.schema_markup ?? {},
      aeo_notes: Array.isArray(input.aeo_notes) ? input.aeo_notes : [],
    };
    if (targetType === "news") {
      draft.geo_area = input.geo_area ?? "";
      draft.geo_entity = input.geo_entity ?? "";
      draft.geo_notes = input.geo_notes ?? "";
    }

    return json({ draft, warnings, model: MODEL, usage: data.usage ?? null }, 200, cors);
  } catch (err) {
    console.error("[ai-seo-geo]", err);
    return json({ error: (err as Error).message }, 500, cors);
  }
});
