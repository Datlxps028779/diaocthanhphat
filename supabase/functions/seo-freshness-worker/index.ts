import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BATCH = 25;

type FreshnessJob = {
  id: string;
  path: string;
};

type WorkerResult = {
  ok: boolean;
  count?: number;
  error?: string;
};

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 1000);
  return String(value).slice(0, 1000);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const workerSecret = env("SEO_FRESHNESS_WORKER_SECRET");
  const providedSecret = req.headers.get("x-seo-freshness-worker-secret") ?? "";
  if (!workerSecret || providedSecret !== workerSecret) {
    return Response.json({ ok: false, error: "Unauthorized" } satisfies WorkerResult, { status: 401 });
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const revalidationUrl = env("SEO_REVALIDATION_URL") || "https://chonhaviet.com/api/internal/seo-freshness-revalidate";
  if (!supabaseUrl || !serviceRoleKey || !env("SEO_FRESHNESS_INTERNAL_SECRET")) {
    return Response.json({ ok: false, error: "Worker chưa được cấu hình đầy đủ" } satisfies WorkerResult, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const workerId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_seo_freshness_jobs", {
    p_worker_id: workerId,
    p_limit: MAX_BATCH,
  });
  if (claimError) {
    console.error("[seo-freshness-worker] claim failed", claimError.message);
    return Response.json({ ok: false, error: "Không claim được freshness jobs" } satisfies WorkerResult, { status: 503 });
  }

  const jobs = (claimed ?? []) as FreshnessJob[];
  if (jobs.length === 0) return Response.json({ ok: true, count: 0 } satisfies WorkerResult);

  const paths = [...new Set(jobs.map((job) => job.path))];
  let succeeded = true;
  let failure = "";
  try {
    const response = await fetch(revalidationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-seo-freshness-secret": env("SEO_FRESHNESS_INTERNAL_SECRET"),
      },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      succeeded = false;
      failure = `Revalidation HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`;
    }
  } catch (error) {
    succeeded = false;
    failure = errorText(error);
  }

  const completions = await Promise.all(jobs.map((job) => supabase.rpc("complete_seo_freshness_job", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_succeeded: succeeded,
    p_error: succeeded ? null : failure,
  })));
  const completionError = completions.find((result) => result.error)?.error;
  if (completionError) {
    console.error("[seo-freshness-worker] completion failed", completionError.message);
    return Response.json({ ok: false, error: "Revalidation xong nhưng không ghi được trạng thái job" } satisfies WorkerResult, { status: 503 });
  }

  return Response.json(
    succeeded ? { ok: true, count: jobs.length } satisfies WorkerResult : { ok: false, count: jobs.length, error: failure } satisfies WorkerResult,
    { status: succeeded ? 200 : 503 },
  );
});
