import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyAdmin } from "../_shared/cors.ts";
import { callClaude } from "../_shared/anthropic.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  // Dùng service_role để update tags/meta của BẤT KỲ property → chỉ admin.
  const adminId = await verifyAdmin(req, createClient);
  if (!adminId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const { propertyId, title, description, city, district, listingType, price, priceUnit, areaSqm } = await req.json();
    if (!propertyId || !title) {
      return new Response(JSON.stringify({ error: "propertyId and title are required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const priceLabel = priceUnit === "triệu" ? `${price} triệu` : `${price} tỷ`;
    const contentForAI = `${title}. ${description ?? ""}. Khu vực: ${[district, city].filter(Boolean).join(", ")}. Giá: ${priceLabel}. Diện tích: ${areaSqm ?? ""}m². Loại: ${listingType === "cho_thue" ? "cho thuê" : "mua bán"}.`;

    const prompt = `Bạn là chuyên gia SEO BĐS Việt Nam. Hãy tạo:
1. Tối đa 8 thẻ tag SEO cho tin BĐS (dạng slug, ví dụ: dat-nen-binh-duong, nha-pho-di-an), trả về dạng JSON array
2. Meta Title SEO (dưới 65 ký tự)
3. Meta Description SEO (dưới 160 ký tự, hấp dẫn)

Nội dung tin: "${contentForAI}"

Trả về đúng JSON format sau (không có markdown):
{"tags":["tag-1","tag-2"],"metaTitle":"...","metaDescription":"..."}`;

    let tags: string[] = [];
    let metaTitle = "";
    let metaDescription = "";

    const tryParse = (text: string) => {
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [];
          metaTitle = parsed.metaTitle ?? "";
          metaDescription = parsed.metaDescription ?? "";
        }
      } catch { /* use fallback */ }
    };

    if (Deno.env.get("ANTHROPIC_API_KEY")) {
      const text = await callClaude({
        model: Deno.env.get("AI_AUTOTAG_MODEL") || "claude-haiku-4-5",
        maxTokens: 400,
        prompt,
      });
      if (text) tryParse(text);
    } else if (Deno.env.get("OPENAI_API_KEY")) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) { const d = await resp.json(); tryParse(d.choices?.[0]?.message?.content ?? ""); }
    }

    // Fallback: rule-based tags
    if (tags.length === 0) {
      const parts: string[] = [];
      if (district) parts.push(district.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-"));
      if (city) parts.push(city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-"));
      if (listingType === "mua_ban") parts.push("mua-ban-bds");
      if (listingType === "cho_thue") parts.push("cho-thue");
      if (areaSqm) {
        if (areaSqm < 100) parts.push("dien-tich-nho");
        else if (areaSqm < 300) parts.push("dien-tich-vua");
        else parts.push("dien-tich-lon");
      }
      parts.push("bat-dong-san-binh-duong");
      tags = [...new Set(parts)].slice(0, 8);
    }

    // Update property in DB
    await db.from("properties").update({
      tags,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
    }).eq("id", propertyId);

    return new Response(JSON.stringify({ tags, metaTitle, metaDescription }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
