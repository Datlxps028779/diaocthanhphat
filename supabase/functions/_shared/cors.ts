// CORS allowlist dùng chung cho các Edge Function. Thay cho "*" (cho phép mọi
// origin) — chỉ chấp nhận domain thật + preview Vercel. Nếu origin không khớp,
// trả về domain production làm mặc định (không lộ, chỉ chặn trình duyệt bên thứ ba).
const ALLOWED_ORIGINS = [
  "https://chonhaviet.com",
  "https://www.chonhaviet.com",
  "https://diaocthanhphat.com",
  "https://www.diaocthanhphat.com",
  "https://diaocthanhphat.vercel.app",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

// Xác minh caller là owner đã hoàn thành MFA (AAL2). Hàm SQL is_owner_mfa() là
// nguồn quyền duy nhất; không tin profiles.role do quyền admin không còn cấp qua UI.
export async function verifyAdmin(req: Request, createClient: (u: string, k: string, options?: unknown) => any): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const { data: ownerMfa, error } = await authClient.rpc("is_owner_mfa");
  return !error && ownerMfa === true ? user.id : null;
}
