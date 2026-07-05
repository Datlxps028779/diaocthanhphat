const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { full_name, phone, property_id, property_title, message, budget } = body;

    if (!full_name || !phone) {
      return new Response(
        JSON.stringify({ error: "full_name and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
