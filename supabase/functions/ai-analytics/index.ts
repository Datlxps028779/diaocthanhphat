import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyAdmin } from "../_shared/cors.ts";
import { callClaude } from "../_shared/anthropic.ts";

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

    // Nguyên tắc chống bịa: AI CHỈ được dùng số liệu nội bộ đưa vào prompt, không suy
    // đoán thị trường bên ngoài (thứ nó không có dữ liệu). Tách thành system prompt để
    // ràng buộc chặt + temperature thấp để giảm "sáng tác".
    const systemPrompt = `Bạn là chuyên gia phân tích bất động sản tại Việt Nam.

NGUYÊN TẮC BẮT BUỘC (không được vi phạm):
- CHỈ sử dụng các con số trong phần "DỮ LIỆU THỐNG KÊ" bên dưới. TUYỆT ĐỐI KHÔNG bịa thêm bất kỳ số liệu, tên dự án, tên khu vực, tên đối thủ, mức giá, tỷ lệ, hay dữ kiện nào không có sẵn trong dữ liệu.
- KHÔNG viện dẫn dữ liệu thị trường bên ngoài (lãi suất, chỉ số quốc gia, quy hoạch, tin tức, dự báo vĩ mô...) vì bạn KHÔNG được cung cấp các dữ liệu đó.
- Mọi nhận định phải suy ra trực tiếp từ số liệu đã cho. Nếu một mục không đủ dữ liệu để kết luận, ghi rõ "Chưa đủ dữ liệu để đánh giá" thay vì suy đoán.
- Gợi ý hành động chỉ được dựa trên các con số thực tế (ví dụ: số lead chưa xử lý, số tin chờ duyệt, số BĐS nổi bật hiện có).`;

    const prompt = `Dưới đây là số liệu thống kê NỘI BỘ của website BĐS Bình Dương tháng này:

📊 DỮ LIỆU THỐNG KÊ:
- Tổng BĐS: ${stats.totalProperties} (đang hiển thị: ${stats.activeProperties})
- BĐS Mua bán: ${stats.saleProperties} | Cho thuê: ${stats.rentProperties} | Nổi bật: ${stats.featuredProperties}
- Tổng lượt xem: ${stats.totalViews.toLocaleString("vi-VN")}
- Khách hàng (Leads): Tổng ${stats.totalLeads} | Chưa xử lý: ${stats.newLeads} | Tháng này: ${stats.monthLeads} (tháng trước: ${stats.lastMonthLeads}) | Tăng trưởng: ${leadGrowth >= 0 ? "+" : ""}${leadGrowth}%
- Tin đăng chờ duyệt: ${stats.pendingListings}
- Top 5 BĐS nhiều lượt xem nhất: ${stats.topProperties.map((p: { title: string; views?: number }) => `"${p.title}" (${p.views ?? 0} lượt)`).join(", ")}

Hãy viết một báo cáo phân tích ngắn gọn (4-6 đoạn) bằng tiếng Việt, CHỈ dựa trên số liệu trên:
1. Nhận xét tổng quan về hiệu suất website tháng này
2. So sánh cơ cấu mua bán vs cho thuê và tỷ lệ BĐS nổi bật (dựa trên các con số đã cho)
3. Đánh giá tình hình leads: tăng trưởng, số chưa xử lý, khối lượng tháng này so với tháng trước
4. Nhận định xu hướng NỘI BỘ ngắn hạn — CHỈ suy ra từ tăng trưởng lead và lượt xem ở trên, KHÔNG suy đoán thị trường bên ngoài
5. 3-4 gợi ý hành động cụ thể cho Admin, mỗi gợi ý phải gắn với một con số thực tế trong dữ liệu

Dùng bullet points, kết thúc bằng điểm mấu chốt cần hành động ngay. Nếu thiếu dữ liệu cho mục nào, ghi rõ "Chưa đủ dữ liệu".`;

    let analysis = "";

    if (Deno.env.get("ANTHROPIC_API_KEY")) {
      analysis = await callClaude({
        model: Deno.env.get("AI_ANALYTICS_MODEL") || "claude-haiku-4-5",
        maxTokens: 1200,
        temperature: 0.2,
        system: systemPrompt,
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
          model: "gpt-4o-mini",
          max_tokens: 1200,
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
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
