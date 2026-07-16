import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type StageKey = "new" | "contacted" | "nurturing" | "viewing" | "negotiating" | "won" | "lost";
type StepKey = "d1" | "d3" | "d7";

const STEPS: { key: StepKey; delayDays: number }[] = [
  { key: "d1", delayDays: 1 },
  { key: "d3", delayDays: 3 },
  { key: "d7", delayDays: 7 },
];

function pickDripStep(lead: { status: StageKey; created_at: string; follow_up_at: string | null; last_activity_at: string | null; phone: string | null }, sentSteps: string[], now: Date) {
  if (lead.status === "won" || lead.status === "lost") return null;
  if (!lead.phone?.trim()) return null;
  if (lead.follow_up_at && new Date(lead.follow_up_at).getTime() > now.getTime()) return null;
  const basis = lead.last_activity_at ?? lead.created_at;
  const ageDays = Math.floor((now.getTime() - new Date(basis).getTime()) / 86_400_000);
  if (ageDays < 0) return null;
  const sent = new Set(sentSteps);
  return STEPS.find(s => ageDays >= s.delayDays && !sent.has(s.key)) ?? null;
}

function messageFor(step: StepKey, fullName: string | null): string {
  const name = fullName?.trim() || "Anh/Chị";
  if (step === "d1") return `${name} ơi, Dia Oc Thanh Phat vẫn đang giữ thông tin nhu cầu BĐS của mình. Nếu cần xem thêm lựa chọn phù hợp, đội ngũ tư vấn sẵn sàng hỗ trợ.`;
  if (step === "d3") return `${name} ơi, thị trường Bình Dương có thêm nhiều lựa chọn mới theo nhu cầu của mình. Trả lời tin nhắn này nếu mình muốn được lọc nhanh các căn phù hợp.`;
  return `${name} ơi, nếu kế hoạch mua/thuê BĐS vẫn còn, Dia Oc Thanh Phat có thể rà lại ngân sách, pháp lý và khu vực phù hợp để mình không mất thời gian xem sai căn.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const dripSecret = Deno.env.get("NURTURE_DRIP_SECRET") ?? "";
  if (!dripSecret || req.headers.get("x-drip-secret") !== dripSecret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const zaloToken = Deno.env.get("ZALO_OA_TOKEN") ?? "";
  const db = createClient(supabaseUrl, serviceKey);
  const now = new Date();

  const { data: leads, error: leadError } = await db
    .from("leads")
    .select("id, full_name, phone, status, created_at, follow_up_at, last_activity_at, zalo_user_id")
    .not("status", "in", "(won,lost)")
    .limit(100);
  if (leadError) throw leadError;

  const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
  const { data: logs } = leadIds.length
    ? await db.from("lead_drip_log").select("lead_id, step, status").in("lead_id", leadIds)
    : { data: [] };

  const byLead = new Map<string, { sent: Set<string>; logged: Set<string> }>();
  for (const log of logs ?? []) {
    const cur = byLead.get(log.lead_id) ?? { sent: new Set<string>(), logged: new Set<string>() };
    cur.logged.add(log.step);
    if (log.status === "sent") cur.sent.add(log.step);
    byLead.set(log.lead_id, cur);
  }

  const results: Record<string, number> = { sent: 0, skipped: 0, failed: 0, eligible: 0 };

  for (const lead of leads ?? []) {
    const seen = byLead.get(lead.id) ?? { sent: new Set<string>(), logged: new Set<string>() };
    const step = pickDripStep(lead, [...seen.sent], now);
    if (!step) continue;
    results.eligible++;

    let status: "sent" | "skipped" | "failed" = "skipped";
    let detail = "missing_zalo_token_or_user_id";

    if (zaloToken && lead.zalo_user_id) {
      try {
        const resp = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": zaloToken },
          body: JSON.stringify({ recipient: { user_id: lead.zalo_user_id }, message: { text: messageFor(step.key, lead.full_name) } }),
        });
        status = resp.ok ? "sent" : "failed";
        detail = resp.ok ? "ok" : `zalo_failed:${resp.status}`;
      } catch (e) {
        status = "failed";
        detail = `zalo_error:${(e as Error).message}`;
      }
    }

    if (status !== "skipped" || !seen.logged.has(step.key)) {
      await db.from("lead_drip_log").insert({ lead_id: lead.id, step: step.key, channel: "zalo", status, detail });
    }
    results[status]++;
  }

  return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
