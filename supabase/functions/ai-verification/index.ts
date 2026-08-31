import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyAdmin } from "../_shared/cors.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const CONTRACT_VERSION = "p11-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = [
  "contact_confirmed",
  "location_info_reviewed",
  "media_reviewed",
  "listing_details_reviewed",
  "document_reference_reviewed",
] as const;
const EVIDENCE_KINDS = [
  "contact_confirmation",
  "location_reference",
  "media_reference",
  "document_reference",
  "other",
] as const;
const SCOPE_EVIDENCE_KIND: Record<string, string> = {
  contact_confirmed: "contact_confirmation",
  location_info_reviewed: "location_reference",
  media_reviewed: "media_reference",
  listing_details_reviewed: "other",
  document_reference_reviewed: "document_reference",
};
const WARNING = "Đây chỉ là gợi ý hỗ trợ; không phải kết luận xác minh, bảo đảm pháp lý hoặc cam kết an toàn giao dịch.";

function responseJson(cors: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, ...JSON_HEADERS } });
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildRecommendation(caseId: string, caseStatus: string, scopeCodes: unknown, evidenceRows: unknown[]) {
  const scopes = SCOPES.filter(scope => Array.isArray(scopeCodes) && scopeCodes.includes(scope));
  const evidence = evidenceRows
    .filter((item): item is { id: string; kind: string } => Boolean(item) && typeof item === "object")
    .filter(item => UUID_PATTERN.test(item.id) && EVIDENCE_KINDS.includes(item.kind as typeof EVIDENCE_KINDS[number]))
    .map(item => ({ id: item.id, kind: item.kind }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const kinds = new Set(evidence.map(item => item.kind));
  const missingScopes = scopes.filter(scope => !kinds.has(SCOPE_EVIDENCE_KIND[scope]));
  const status = evidence.length === 0
    ? "insufficient_evidence"
    : missingScopes.length > 0
      ? "needs_more_evidence"
      : "ready_for_manual_review";
  const summary = status === "insufficient_evidence"
    ? "Chưa có bằng chứng riêng tư; chưa đủ cơ sở để chuyển hồ sơ sang bước xem xét thủ công."
    : status === "needs_more_evidence"
      ? `Cần bổ sung bằng chứng cho ${missingScopes.length} phạm vi trước khi owner MFA xem xét thủ công.`
      : "Đã có tham chiếu bằng chứng theo phạm vi; owner MFA vẫn phải tự kiểm tra và quyết định thủ công.";
  const fingerprintInput = JSON.stringify({ case_id: caseId, case_status: caseStatus, scope_codes: scopes, evidence, status, missing_scopes: missingScopes });
  return {
    case_id: caseId,
    case_status: caseStatus,
    status,
    summary,
    missing_scopes: missingScopes,
    evidence,
    warnings: [WARNING],
    provenance: {
      provider: "deterministic-fallback",
      model: null,
      generated_at: new Date().toISOString(),
      input_fields: ["case_status", "scope_codes", "evidence_ids", "evidence_kinds"],
      contract_version: CONTRACT_VERSION,
      output_fingerprint: fingerprint(fingerprintInput),
    },
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return responseJson(cors, { error: "method_not_allowed" }, 405);

  const adminId = await verifyAdmin(req, createClient);
  if (!adminId) return responseJson(cors, { error: "unauthorized" }, 401);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return responseJson(cors, { error: "invalid_json" }, 400);
    }
    if (!body || typeof body !== "object") return responseJson(cors, { error: "invalid_input" }, 400);
    const caseId = (body as Record<string, unknown>).caseId;
    if (typeof caseId !== "string" || !UUID_PATTERN.test(caseId)) return responseJson(cors, { error: "case_id_required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return responseJson(cors, { error: "service_unavailable" }, 503);
    const db = createClient(supabaseUrl, serviceKey);
    const [{ data: verificationCase, error: caseError }, { data: evidenceRows, error: evidenceError }] = await Promise.all([
      db.from("property_verification_cases").select("id,status,scope_codes").eq("id", caseId).maybeSingle(),
      db.from("property_verification_evidence").select("id,case_id,kind").eq("case_id", caseId).order("created_at", { ascending: true }),
    ]);
    if (caseError || evidenceError) return responseJson(cors, { error: "internal_error" }, 500);
    if (!verificationCase) return responseJson(cors, { error: "case_not_found" }, 404);

    return responseJson(cors, buildRecommendation(verificationCase.id, verificationCase.status, verificationCase.scope_codes, evidenceRows ?? []));
  } catch {
    return responseJson(cors, { error: "internal_error" }, 500);
  }
});
