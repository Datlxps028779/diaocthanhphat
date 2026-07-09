import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyAdmin } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  // Chặn truy cập trái phép: số liệu kinh doanh (leads, doanh thu, tin chờ duyệt)
  // chỉ dành cho admin. Trước đây ai gọi cũng đọc được.
  const adminId = await verifyAdmin(req, createClient);
  if (!adminId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalProps, activeProps, saleProps, rentProps, featuredProps,
      totalLeads, newLeads, monthLeads, lastMonthLeads,
      pendingListings, totalViews,
      topProps,
    ] = await Promise.all([
      db.from("properties").select("id", { count: "exact", head: true }),
      db.from("properties").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("properties").select("id", { count: "exact", head: true }).eq("listing_type", "mua_ban").eq("is_active", true),
      db.from("properties").select("id", { count: "exact", head: true }).eq("listing_type", "cho_thue").eq("is_active", true),
      db.from("properties").select("id", { count: "exact", head: true }).eq("is_featured", true),
      db.from("leads").select("id", { count: "exact", head: true }),
      db.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      db.from("leads").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
      db.from("leads").select("id", { count: "exact", head: true }).gte("created_at", startOfLastMonth).lte("created_at", endOfLastMonth),
      db.from("user_listings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("properties").select("views").eq("is_active", true),
      db.from("properties").select("title, price, price_unit, price_label, views, city, district").eq("is_active", true).order("views", { ascending: false }).limit(5),
    ]);

    const sumViews = (totalViews.data ?? []).reduce((s: number, r: { views?: number }) => s + (r.views ?? 0), 0);
    const leadGrowth = (lastMonthLeads.count ?? 0) > 0
      ? Math.round(((monthLeads.count ?? 0) - (lastMonthLeads.count ?? 0)) / (lastMonthLeads.count ?? 1) * 100)
      : 0;

    const stats = {
      totalProperties: totalProps.count ?? 0,
      activeProperties: activeProps.count ?? 0,
      saleProperties: saleProps.count ?? 0,
      rentProperties: rentProps.count ?? 0,
      featuredProperties: featuredProps.count ?? 0,
      totalLeads: totalLeads.count ?? 0,
      newLeads: newLeads.count ?? 0,
      monthLeads: monthLeads.count ?? 0,
      lastMonthLeads: lastMonthLeads.count ?? 0,
      leadGrowth,
      pendingListings: pendingListings.count ?? 0,
      totalViews: sumViews,
      topProperties: topProps.data ?? [],
    };

    const prompt = `Bạn là chuyên gia phân tích bất động sản tại Việt Nam. Dưới đây là số liệu thống kê của website BĐS Bình Dương tháng này:

📊 DỮ LIỆU THỐNG KÊ:
- Tổng BĐS: ${stats.totalProperties} (đang hiển thị: ${stats.activeProperties})
- BĐS Mua bán: ${stats.saleProperties} | Cho thuê: ${stats.rentProperties} | Nổi bật: ${stats.featuredProperties}
- Tổng lượt xem: ${stats.totalViews.toLocaleString("vi-VN")}
- Khách hàng (Leads): Tổng ${stats.totalLeads} | Chưa xử lý: ${stats.newLeads} | Tháng này: ${stats.monthLeads} (tháng trước: ${stats.lastMonthLeads}) | Tăng trưởng: ${leadGrowth >= 0 ? "+" : ""}${leadGrowth}%
- Tin đăng chờ duyệt: ${stats.pendingListings}
- Top 5 BĐS nhiều lượt xem nhất: ${stats.topProperties.map((p: { title: string; views?: number }) => `"${p.title}" (${p.views ?? 0} lượt)`).join(", ")}

Hãy viết một báo cáo phân tích ngắn gọn (4-6 đoạn) bằng tiếng Việt bao gồm:
1. Nhận xét tổng quan về hiệu suất website tháng này
2. Phân tích xu hướng thị trường BĐS dựa trên dữ liệu (mua bán vs cho thuê, BĐS hot)
3. Đánh giá chất lượng leads và tỷ lệ chuyển đổi
4. Dự báo xu hướng ngắn hạn cho thị trường BĐS vùng ven (Bình Dương, Bình Phước, Đồng Nai)
5. 3-4 gợi ý chiến lược cụ thể cho Admin để tăng hiệu quả kinh doanh

Viết chuyên nghiệp, sử dụng bullet points, và kết thúc bằng điểm mấu chốt cần hành động ngay.`;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");

    let analysis = "";

    if (Deno.env.get("ANTHROPIC_API_KEY")) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        analysis = data.content?.[0]?.text ?? "";
      }
    } else if (Deno.env.get("OPENAI_API_KEY")) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        analysis = data.choices?.[0]?.message?.content ?? "";
      }
    }

    if (!analysis) {
      // Fallback: rule-based analysis without AI
      const trend = leadGrowth > 0 ? "tăng trưởng tích cực" : leadGrowth < 0 ? "giảm so với tháng trước" : "ổn định";
      analysis = `**Tổng quan tháng ${now.getMonth() + 1}/${now.getFullYear()}:**

Website hiện có ${stats.activeProperties} BĐS đang hoạt động với tổng ${stats.totalViews.toLocaleString("vi-VN")} lượt xem. Phân khúc mua bán chiếm ${stats.saleProperties} tin (${stats.totalProperties > 0 ? Math.round(stats.saleProperties / stats.activeProperties * 100) : 0}%), phân khúc cho thuê chiếm ${stats.rentProperties} tin.

**Phân tích Leads:**
- Tháng này đạt ${stats.monthLeads} lead mới (${trend}).
- Còn ${stats.newLeads} lead chưa được xử lý — cần liên hệ sớm để không bỏ lỡ khách hàng tiềm năng.

**Gợi ý chiến lược:**
• Kích hoạt thêm ${Math.max(0, 5 - stats.featuredProperties)} BĐS nổi bật để tăng tỷ lệ chuyển đổi
• Xử lý ${stats.newLeads} lead chưa phản hồi trong 24h tới
• Duyệt ${stats.pendingListings} tin đăng đang chờ để tăng lượng BĐS trên hệ thống
• Tối ưu tiêu đề và ảnh đại diện của top BĐS để tăng CTR

**Hành động ngay:** Liên hệ ${stats.newLeads} khách hàng mới và duyệt ${stats.pendingListings} tin đăng.`;
    }

    return new Response(
      JSON.stringify({ analysis, stats }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
