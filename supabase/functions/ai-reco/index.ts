import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callRecoClaude } from "./claude.ts";
import { clientIp, isRateLimited } from "../_shared/ratelimit.ts";
import {
  MAX_RECO_BODY_BYTES,
  listingTypeLabel,
  normalizeRecoInput,
  type NormalizedProfileDigest,
} from "./contract.ts";

interface CanonicalCandidate {
  id: string;
  area: string | null;
  type: string | null;
  listingType: string | null;
  district: string | null;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 15 * 60 * 1000;
const PENDING_CACHE_TTL_MS = 30 * 1000;

function cleanDbLabel(value: unknown, maxLength = 80): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function relatedName(value: unknown): string | null {
  if (Array.isArray(value)) return cleanDbLabel(value[0]?.name);
  if (!value || typeof value !== "object") return null;
  return cleanDbLabel((value as { name?: unknown }).name);
}

async function cacheKeyOf(profileDigest: NormalizedProfileDigest, candidates: CanonicalCandidate[]): Promise<string> {
  const canonicalCandidates = [...candidates]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(candidate => ({
      id: candidate.id,
      area: candidate.area,
      type: candidate.type,
      listingType: candidate.listingType,
      district: candidate.district,
    }));
  const payload = JSON.stringify({ digest: profileDigest, candidates: canonicalCandidates });
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function buildSystemPrompt(): string {
  return `Bạn là bộ xếp hạng bất động sản. Chỉ xếp lại các id có trong DANH SÁCH ỨNG VIÊN theo mức độ phù hợp với HỒ SƠ SỞ THÍCH.

NGUYÊN TẮC BẮT BUỘC:
- Chỉ dùng khu vực, quận/huyện, loại bất động sản và hình thức mua/thuê được cung cấp.
- Không tạo id mới, không suy diễn giá, pháp lý, tiềm năng đầu tư hoặc dữ liệu ngoài.
- Chỉ trả về JSON thuần là một mảng id theo thứ tự ưu tiên giảm dần.`;
}

function buildPrompt(profileDigest: NormalizedProfileDigest, candidates: CanonicalCandidate[]): string {
  const candidateLines = candidates.map((candidate, index) =>
    `${index + 1}. id=${candidate.id} | khu vực: ${candidate.area ?? "?"}${candidate.district ? " / " + candidate.district : ""} | loại: ${candidate.type ?? "?"} | hình thức: ${listingTypeLabel(candidate.listingType) ?? "?"}`
  ).join("\n");

  return `HỒ SƠ SỞ THÍCH ĐÃ ẨN DANH:
- Khu vực: ${profileDigest.areas.length ? profileDigest.areas.join(", ") : "chưa rõ"}
- Loại BĐS: ${profileDigest.types.length ? profileDigest.types.join(", ") : "chưa rõ"}
- Hình thức: ${profileDigest.listingTypes.length ? profileDigest.listingTypes.join(", ") : "chưa rõ"}

DANH SÁCH ỨNG VIÊN:
${candidateLines}

Trả về JSON thuần, ví dụ: ["id-1", "id-2"]. Có thể trả ít hơn tổng số ứng viên.`;
}

function sanitizeRanking(raw: string, candidates: CanonicalCandidate[]): string[] | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const valid = new Set(candidates.map(candidate => candidate.id));
  const seen = new Set<string>();
  const ranked: string[] = [];
  for (const item of parsed) {
    const id = typeof item === "string"
      ? item
      : item && typeof item === "object"
        ? (item as { id?: unknown }).id
        : null;
    if (typeof id !== "string" || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    ranked.push(id);
  }
  return ranked.length ? ranked : null;
}

function reasonFor(candidate: CanonicalCandidate, digest: NormalizedProfileDigest): string {
  if (candidate.area && digest.areas.includes(candidate.area)) return "Cùng khu vực bạn đang quan tâm";
  if (candidate.type && digest.types.includes(candidate.type)) return "Đúng loại bất động sản bạn thường xem";
  const listingLabel = listingTypeLabel(candidate.listingType);
  if (listingLabel && digest.listingTypes.includes(listingLabel)) return `Phù hợp nhu cầu ${listingLabel} của bạn`;
  return "Phù hợp nhu cầu bạn đang tìm";
}

async function readBoundedBody(req: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return json({ ranked: null }, 405);
    if (isRateLimited(`ai-reco:${clientIp(req)}`, 6, 60_000)) return json({ ranked: null }, 429);

    const rawBody = await readBoundedBody(req, MAX_RECO_BODY_BYTES);
    if (rawBody === null) return json({ ranked: null }, 413);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ ranked: null }, 400);
    }
    const input = normalizeRecoInput(body);
    if (!input) return json({ ranked: null }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);
    const { data: rows, error: propertyError } = await db
      .from("properties")
      .select("id, listing_type, district, areas(name), property_types(name)")
      .eq("is_active", true)
      .in("id", input.candidateIds);
    if (propertyError) throw propertyError;

    const canonicalById = new Map<string, CanonicalCandidate>();
    for (const row of rows ?? []) {
      if (typeof row.id !== "string") continue;
      canonicalById.set(row.id, {
        id: row.id,
        area: relatedName(row.areas),
        type: relatedName(row.property_types),
        listingType: cleanDbLabel(row.listing_type, 24),
        district: cleanDbLabel(row.district),
      });
    }
    const candidates = input.candidateIds
      .map(id => canonicalById.get(id))
      .filter((candidate): candidate is CanonicalCandidate => Boolean(candidate))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!candidates.length) return json({ ranked: null }, 400);

    const cacheKey = await cacheKeyOf(input.profileDigest, candidates);
    const { data: cached, error: cacheReadError } = await db
      .from("reco_cache")
      .select("ranked, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cacheReadError) return json({ ranked: null, diagnostic: "cache_unavailable" });

    if (cached) {
      const age = Date.now() - new Date(cached.created_at).getTime();
      const cachedPending = Boolean(
        cached.ranked && typeof cached.ranked === "object" && !Array.isArray(cached.ranked) && cached.ranked.pending === true,
      );
      const cachedFailure = Array.isArray(cached.ranked) && cached.ranked.length === 0;
      const ttl = cachedPending ? PENDING_CACHE_TTL_MS : cachedFailure ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS;
      if (age < ttl) {
        return json({
          ranked: cachedPending || cachedFailure ? null : cached.ranked,
          cached: true,
          ...(cachedPending ? { diagnostic: "ranking_pending" } : {}),
          ...(cachedFailure ? { diagnostic: "cached_failure" } : {}),
        });
      }

      const { error: staleDeleteError } = await db.from("reco_cache").delete().eq("cache_key", cacheKey);
      if (staleDeleteError) return json({ ranked: null, diagnostic: "cache_unavailable" });
    }

    const { error: claimError } = await db.from("reco_cache").insert({
      cache_key: cacheKey,
      ranked: { pending: true },
      created_at: new Date().toISOString(),
    });
    if (claimError) {
      if (claimError.code === "23505") return json({ ranked: null, cached: true, diagnostic: "ranking_pending" });
      return json({ ranked: null, diagnostic: "cache_unavailable" });
    }

    const { data: budgetReserved, error: budgetError } = await db.rpc("reserve_ai_reco_budget");
    if (budgetError || budgetReserved !== true) {
      await db.from("reco_cache").delete().eq("cache_key", cacheKey);
      return json({ ranked: null, limited: true });
    }

    const claude = await callRecoClaude({
      model: Deno.env.get("AI_RECO_MODEL") || "claude-haiku-4-5",
      maxTokens: 400,
      system: buildSystemPrompt(),
      prompt: buildPrompt(input.profileDigest, candidates),
    });
    if (!claude.text) {
      const { error: failureCacheError } = await db.from("reco_cache").update({
        ranked: [],
        created_at: new Date().toISOString(),
      }).eq("cache_key", cacheKey);
      if (failureCacheError) console.error("ai-reco failure cache update failed", failureCacheError);
      return json({ ranked: null, diagnostic: claude.diagnostic ?? "llm_empty" });
    }
    const rankedIds = sanitizeRanking(claude.text, candidates);
    if (!rankedIds) {
      const { error: parseCacheError } = await db.from("reco_cache").update({
        ranked: [],
        created_at: new Date().toISOString(),
      }).eq("cache_key", cacheKey);
      if (parseCacheError) console.error("ai-reco parse cache update failed", parseCacheError);
      return json({ ranked: null, diagnostic: "parse_failed" });
    }

    const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
    const ranked = rankedIds.map(id => ({ id, reason: reasonFor(byId.get(id)!, input.profileDigest) }));
    const { error: successCacheError } = await db.from("reco_cache").update({
      ranked,
      created_at: new Date().toISOString(),
    }).eq("cache_key", cacheKey);
    if (successCacheError) console.error("ai-reco success cache update failed", successCacheError);
    return json({ ranked });
  } catch (error) {
    console.error("ai-reco unavailable", error);
    return json({ ranked: null, error: "Unavailable" });
  }
});
