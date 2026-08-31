import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyAdminOrStaff } from "../_shared/cors.ts";
import { callClaude } from "../_shared/anthropic.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const CONTRACT_VERSION = "p10-v1";

function responseJson(cors: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...JSON_HEADERS },
  });
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map(toSlug)
    .filter(Boolean))].slice(0, 8);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function makeProvenance(input: {
  provider: string;
  model: string | null;
  output: string;
}): Record<string, unknown> {
  return {
    kind: "seo",
    status: "draft",
    provider: input.provider,
    model: input.model,
    generated_at: new Date().toISOString(),
    input_fields: ["title", "description", "city", "district", "listing_type", "price", "area_sqm"],
    contract_version: CONTRACT_VERSION,
    output_fingerprint: fingerprint(input.output),
  };
}

function fallbackTags(listing: Record<string, unknown>): string[] {
  const tags = [
    typeof listing.district === "string" ? toSlug(listing.district) : "",
    typeof listing.city === "string" ? toSlug(listing.city) : "",
    listing.listing_type === "mua_ban" ? "mua-ban" : listing.listing_type === "cho_thue" ? "cho-thue" : "",
    "bat-dong-san",
  ].filter(Boolean);
  return [...new Set(tags)].slice(0, 8);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return responseJson(cors, { error: "method_not_allowed" }, 405);

  const adminId = await verifyAdminOrStaff(req, createClient);
  if (!adminId) return responseJson(cors, { error: "unauthorized" }, 401);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return responseJson(cors, { error: "invalid_json" }, 400);
    }
    if (!raw || typeof raw !== "object") return responseJson(cors, { error: "invalid_input" }, 400);
    const userListingId = (raw as Record<string, unknown>).userListingId;
    if (typeof userListingId !== "string" || !/^[0-9a-f-]{36}$/i.test(userListingId)) {
      return responseJson(cors, { error: "user_listing_id_required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return responseJson(cors, { error: "service_unavailable" }, 503);
    const db = createClient(supabaseUrl, serviceKey);
    const { data: listing, error: listingError } = await db
      .from("user_listings")
      .select("id,status,title,description,city,district,listing_type,price,price_unit,area_sqm,property_type_id,ai_provenance")
      .eq("id", userListingId)
      .maybeSingle();
    if (listingError) return responseJson(cors, { error: "internal_error" }, 500);
    if (!listing) return responseJson(cors, { error: "listing_not_found" }, 404);
    if (listing.status !== "pending") return responseJson(cors, { error: "listing_not_pending" }, 409);

    const title = cleanText(listing.title, 120);
    const description = cleanText(listing.description, 3000);
    const city = cleanText(listing.city, 120);
    const district = cleanText(listing.district, 120);
    const listingType = listing.listing_type === "cho_thue" ? "cho thuê" : "mua bán";
    const price = typeof listing.price === "number" ? String(listing.price) : "";
    const area = typeof listing.area_sqm === "number" ? String(listing.area_sqm) : "";
    const sourceText = `Tiêu đề: ${title}\nMô tả: ${description}\nTỉnh/thành: ${city}\nQuận/huyện: ${district}\nLoại tin: ${listingType}\nGiá: ${price} ${cleanText(listing.price_unit, 32)}\nDiện tích: ${area} m²`;
    const prompt = `Tạo bản nháp SEO cho một tin bất động sản tại Việt Nam từ đúng dữ liệu dưới đây. Không suy đoán hoặc thêm pháp lý, quy hoạch, tiện ích, khoảng cách, lợi nhuận hay cam kết không có trong dữ liệu. Trả đúng JSON, không markdown: {"tags":["slug-1"],"metaTitle":"tối đa 65 ký tự","metaDescription":"tối đa 160 ký tự"}.\n\n${sourceText}`;

    let tags: string[] = [];
    let metaTitle = "";
    let metaDescription = "";
    let provider = "deterministic-fallback";
    let model: string | null = null;

    const parseModelOutput = (text: string) => {
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return;
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        tags = cleanTags(parsed.tags);
        metaTitle = cleanText(parsed.metaTitle, 65);
        metaDescription = cleanText(parsed.metaDescription, 160);
      } catch {
        tags = [];
        metaTitle = "";
        metaDescription = "";
      }
    };

    if (Deno.env.get("ANTHROPIC_API_KEY")) {
      provider = "anthropic";
      model = Deno.env.get("AI_AUTOTAG_MODEL") || "claude-haiku-4-5";
      parseModelOutput(await callClaude({ model, maxTokens: 400, prompt }));
    } else if (Deno.env.get("OPENAI_API_KEY")) {
      provider = "openai";
      model = "gpt-3.5-turbo";
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });
      if (resp.ok) {
        const data = await resp.json();
        parseModelOutput(typeof data.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "");
      }
    }

    if (tags.length === 0) {
      provider = "deterministic-fallback";
      model = null;
      tags = fallbackTags(listing as Record<string, unknown>);
    }

    const output = JSON.stringify({ tags, metaTitle, metaDescription });
    const draft = {
      tags,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      provenance: makeProvenance({ provider, model, output }),
    };
    const existingProvenance = Array.isArray(listing.ai_provenance) ? listing.ai_provenance : [];
    const nextProvenance = [...existingProvenance.filter((item: unknown) => (item as Record<string, unknown>)?.kind !== "seo"), draft.provenance];
    const { error: updateError } = await db
      .from("user_listings")
      .update({ ai_seo_draft: draft, ai_provenance: nextProvenance })
      .eq("id", userListingId)
      .eq("status", "pending");
    if (updateError) return responseJson(cors, { error: "internal_error" }, 500);

    return responseJson(cors, {
      tags,
      metaTitle,
      metaDescription,
      provenance: draft.provenance,
    });
  } catch {
    return responseJson(cors, { error: "internal_error" }, 500);
  }
});
