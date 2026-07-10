import { corsHeaders } from "../_shared/cors.ts";
import { clientIp, isRateLimited } from "../_shared/ratelimit.ts";

// Form công khai gọi (gửi lead) → KHÔNG yêu cầu admin. Siết CORS allowlist +
// validate/giới hạn độ dài input + rate-limit theo IP để chống spam lead.
const cap = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  // Lead thật cũng đi qua đây → hạn mức thoáng hơn: 12 request/phút mỗi IP.
  if (isRateLimited(`crm:${clientIp(req)}`, 12, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const full_name = cap(body.full_name, 120);
    const phone = cap(body.phone, 20);
    const property_id = cap(body.property_id, 64);
    const property_title = cap(body.property_title, 300);
    const message = cap(body.message, 2000);
    const budget = cap(body.budget, 100);

    // SĐT VN cơ bản: 8-15 chữ số (cho phép +, khoảng trắng khi nhập)
    const phoneDigits = phone.replace(/[^\d]/g, "");
    if (!full_name || phoneDigits.length < 8 || phoneDigits.length > 15) {
      return new Response(
        JSON.stringify({ error: "full_name và phone hợp lệ là bắt buộc" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const webhookUrl = Deno.env.get("CRM_WEBHOOK_URL");
    const zaloOaToken = Deno.env.get("ZALO_OA_TOKEN");

    const leadPayload = {
      source: "nhadatketnoibinhduong",
      timestamp: new Date().toISOString(),
      contact: { full_name, phone },
      property: { id: property_id ?? null, title: property_title ?? null },
      inquiry: { message: message ?? null, budget: budget ?? null },
    };

    const results: Record<string, string> = {};

    if (webhookUrl) {
      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(leadPayload),
        });
        results.crm = resp.ok ? "sent" : `failed:${resp.status}`;
      } catch (e) {
        results.crm = `error:${(e as Error).message}`;
      }
    }

    if (zaloOaToken) {
      try {
        const zaloMsg = `Khách hàng mới:\nTên: ${full_name}\nSĐT: ${phone}\nBĐS: ${property_title ?? "Chưa xác định"}\nNgân sách: ${budget ?? "N/A"}\nNội dung: ${message ?? ""}`;
        const resp = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": zaloOaToken },
          body: JSON.stringify({ recipient: { message_type: "cs" }, message: { text: zaloMsg } }),
        });
        results.zalo = resp.ok ? "sent" : `failed:${resp.status}`;
      } catch (e) {
        results.zalo = `error:${(e as Error).message}`;
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
