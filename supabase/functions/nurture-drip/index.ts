import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type StageKey = "new" | "contacted" | "nurturing" | "viewing" | "negotiating" | "won" | "lost";
type Channel = "zalo" | "sms" | "email";

interface DripStep {
  id: string;
  delay_days: number;
  channel: Channel;
  message_template: string;
  enabled: boolean;
  sort_order: number;
}

interface DripFilter {
  eligible_statuses: string[];
  require_phone: boolean;
}

interface DripLead {
  id: string;
  status: StageKey;
  created_at: string;
  follow_up_at: string | null;
  last_activity_at: string | null;
  phone: string | null;
  full_name: string | null;
  area_interest: string | null;
  budget: string | null;
  message: string | null;
  note: string | null;
  zalo_user_id: string | null;
}

function pickDripStep(lead: DripLead, sentStepIds: string[], now: Date, steps: DripStep[], filter: DripFilter): DripStep | null {
  if (lead.status === "won" || lead.status === "lost") return null;
  if (!filter.eligible_statuses.includes(lead.status)) return null;
  if (filter.require_phone && !lead.phone?.trim()) return null;
  if (lead.follow_up_at && new Date(lead.follow_up_at).getTime() > now.getTime()) return null;
  const basis = lead.last_activity_at ?? lead.created_at;
  const ageDays = Math.floor((now.getTime() - new Date(basis).getTime()) / 86_400_000);
  if (ageDays < 0) return null;
  const sent = new Set(sentStepIds);
  const ordered = steps
    .filter(s => s.enabled)
    .sort((a, b) => a.sort_order - b.sort_order || a.delay_days - b.delay_days);
  return ordered.find(s => ageDays >= s.delay_days && !sent.has(s.id)) ?? null;
}

function renderTemplate(tpl: string, lead: DripLead): string {
  const values: Record<string, string> = {
    "{ten}": lead.full_name?.trim() || "Anh/Chị",
    "{khu_vuc}": lead.area_interest?.trim() || "khu vực bạn quan tâm",
    "{ngan_sach}": lead.budget?.trim() || "ngân sách của mình",
    "{nhu_cau}": lead.message?.trim() || lead.note?.trim() || "nhu cầu BĐS",
  };
  return tpl.replace(/\{ten\}|\{khu_vuc\}|\{ngan_sach\}|\{nhu_cau\}/g, m => values[m] ?? m);
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

  // Cấu hình luật lọc + bước động đọc từ DB (không còn hard-code).
  const { data: cfg } = await db
    .from("nurture_drip_config")
    .select("eligible_statuses, require_phone")
    .eq("id", true)
    .maybeSingle();
  const filter: DripFilter = {
    eligible_statuses: (cfg?.eligible_statuses as string[] | undefined) ?? ["new", "contacted", "nurturing", "viewing", "negotiating"],
    require_phone: (cfg?.require_phone as boolean | undefined) ?? true,
  };

  const { data: stepRows, error: stepError } = await db
    .from("nurture_drip_step")
    .select("id, delay_days, channel, message_template, enabled, sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (stepError) throw stepError;
  const steps = (stepRows ?? []) as DripStep[];
  if (steps.length === 0) {
    return new Response(JSON.stringify({ success: true, results: { sent: 0, skipped: 0, failed: 0, eligible: 0 }, note: "no_enabled_steps" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const eligibleStatuses = filter.eligible_statuses.filter(s => s !== "won" && s !== "lost");
  const { data: leads, error: leadError } = await db
    .from("leads")
    .select("id, full_name, phone, status, created_at, follow_up_at, last_activity_at, area_interest, budget, message, note, zalo_user_id")
    .in("status", eligibleStatuses.length ? eligibleStatuses : ["__none__"])
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

  for (const lead of (leads ?? []) as DripLead[]) {
    const seen = byLead.get(lead.id) ?? { sent: new Set<string>(), logged: new Set<string>() };
    const step = pickDripStep(lead, [...seen.sent], now, steps, filter);
    if (!step) continue;
    results.eligible++;

    let status: "sent" | "skipped" | "failed" = "skipped";
    let detail = "missing_zalo_token_or_user_id";

    if (step.channel !== "zalo") {
      status = "skipped";
      detail = "channel_not_implemented";
    } else if (zaloToken && lead.zalo_user_id) {
      try {
        const resp = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": zaloToken },
          body: JSON.stringify({ recipient: { user_id: lead.zalo_user_id }, message: { text: renderTemplate(step.message_template, lead) } }),
        });
        status = resp.ok ? "sent" : "failed";
        detail = resp.ok ? "ok" : `zalo_failed:${resp.status}`;
      } catch (e) {
        status = "failed";
        detail = `zalo_error:${(e as Error).message}`;
      }
    }

    if (status !== "skipped" || !seen.logged.has(step.id)) {
      await db.from("lead_drip_log").insert({ lead_id: lead.id, step: step.id, channel: step.channel, status, detail });
    }
    results[status]++;
  }

  return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
