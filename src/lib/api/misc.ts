import { supabase, type Subscriber } from '../supabase';

// ─── Dashboard stats ──────────────────────────────────────────────────────────
export interface DashboardStats {
  totalProperties: number;
  activeProperties: number;
  featuredProperties: number;
  hotProperties: number;
  saleProperties: number;
  rentProperties: number;
  totalLeads: number;
  newLeads: number;
  pendingListings: number;
  totalViews: number;
  monthLeads: number;
  lastMonthLeads: number;
  leadGrowth: number;
  monthProperties: number;
  totalNews: number;
}

const EMPTY_STATS: DashboardStats = {
  totalProperties: 0, activeProperties: 0, featuredProperties: 0, hotProperties: 0,
  saleProperties: 0, rentProperties: 0, totalLeads: 0, newLeads: 0, pendingListings: 0,
  totalViews: 0, monthLeads: 0, lastMonthLeads: 0, leadGrowth: 0, monthProperties: 0, totalNews: 0,
};

export async function getDashboardStats(): Promise<DashboardStats> {
  // Ưu tiên RPC phía DB (đếm + SUM(views) trong 1 call, không kéo dữ liệu thô về
  // client). Fallback cách cũ nếu RPC chưa áp lên DB — tránh sập admin khi lệch
  // nhịp deploy (xem supabase/migrations/20260708010000_dashboard_stats_rpc.sql).
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (!error && data) {
    return { ...EMPTY_STATS, ...(data as Partial<DashboardStats>) };
  }
  return getDashboardStatsFallback();
}

// Fallback: cách cũ (11 round-trip + reduce views phía client). Chỉ dùng khi RPC
// get_dashboard_stats chưa tồn tại trên DB.
async function getDashboardStatsFallback(): Promise<DashboardStats> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const [propRes, leadsRes, newLeadsRes, viewsRes, pendingRes,
    monthLeads, lastMonthLeads, rentProps, saleProps,
    monthProps, newsTotalRes] = await Promise.all([
    supabase.from('properties').select('id, is_active, is_featured, is_hot, listing_type', { count: 'exact' }),
    supabase.from('leads').select('id', { count: 'exact' }),
    supabase.from('leads').select('id', { count: 'exact' }).eq('status', 'new'),
    supabase.from('properties').select('views').eq('is_active', true),
    supabase.from('user_listings').select('id', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', startOfMonth),
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', startOfLastMonth).lte('created_at', endOfLastMonth),
    supabase.from('properties').select('id', { count: 'exact' }).eq('is_active', true).eq('listing_type', 'cho_thue'),
    supabase.from('properties').select('id', { count: 'exact' }).eq('is_active', true).eq('listing_type', 'mua_ban'),
    supabase.from('properties').select('id', { count: 'exact' }).gte('created_at', startOfMonth),
    supabase.from('news').select('id', { count: 'exact' }).eq('is_published', true),
  ]);

  const totalViews = (viewsRes.data ?? []).reduce((s, r) => s + (r.views ?? 0), 0);
  const allProps = propRes.data ?? [];
  const leadGrowth = lastMonthLeads.count && lastMonthLeads.count > 0
    ? Math.round(((monthLeads.count ?? 0) - lastMonthLeads.count) / lastMonthLeads.count * 100)
    : 0;

  return {
    totalProperties: propRes.count ?? 0,
    activeProperties: allProps.filter(p => p.is_active).length,
    featuredProperties: allProps.filter(p => p.is_featured).length,
    hotProperties: allProps.filter(p => p.is_hot).length,
    saleProperties: saleProps.count ?? 0,
    rentProperties: rentProps.count ?? 0,
    totalLeads: leadsRes.count ?? 0,
    newLeads: newLeadsRes.count ?? 0,
    pendingListings: pendingRes.count ?? 0,
    totalViews,
    monthLeads: monthLeads.count ?? 0,
    lastMonthLeads: lastMonthLeads.count ?? 0,
    leadGrowth,
    monthProperties: monthProps.count ?? 0,
    totalNews: newsTotalRes.count ?? 0,
  };
}

// ─── AI Description ──────────────────────────────────────────────────────────
export async function generateAIDescription(params: { keywords: string; listingType?: string; area?: string; price?: string }): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  const data = await response.json() as { description?: string; error?: string };
  if (!data.description) throw new Error(data.error ?? 'No description returned');
  return data.description;
}

// ─── AI SEO Analysis ──────────────────────────────────────────────────────────
export interface SeoAnalysisResult {
  score: number;
  suggestions: string[];
  keywordDensity: Record<string, number>;
}

export async function analyzeSeo(params: {
  title: string;
  description: string;
  imageUrl?: string;
  areaName?: string;
  price?: string;
}): Promise<SeoAnalysisResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({
      action: 'analyze-seo',
      ...params,
    }),
  });

  if (!response.ok) throw new Error(`AI SEO Analysis failed (${response.status})`);
  const data = await response.json() as {
    analysis?: string;
    score?: number;
    suggestions?: string[];
    error?: string;
  };

  // Tính điểm SEO cơ bản nếu AI không trả về
  let score = data.score ?? 0;
  const suggestions: string[] = data.suggestions ?? [];

  // Phân tích mật độ từ khóa cơ bản
  const keywordDensity: Record<string, number> = {};
  const words = (params.title + ' ' + params.description).toLowerCase().split(/\s+/);
  const wordCount: Record<string, number> = {};
  words.forEach(w => { wordCount[w] = (wordCount[w] ?? 0) + 1; });

  const totalWords = words.length;
  Object.entries(wordCount).forEach(([word, count]) => {
    if (count > 1 && word.length > 2) {
      keywordDensity[word] = Math.round((count / totalWords) * 100 * 100) / 100;
    }
  });

  return { score, suggestions, keywordDensity };
}

// ─── Data Export ─────────────────────────────────────────────────────────────
export async function exportTableData(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Subscribers (Newsletter) ─────────────────────────────────────────────────
export async function subscribe(email: string, name?: string, areaInterest?: string): Promise<void> {
  const { error } = await supabase
    .from('subscribers')
    .upsert({ email: email.trim().toLowerCase(), name: name ?? null, area_interest: areaInterest ?? null, is_active: true },
      { onConflict: 'email' });
  if (error) throw error;
}

export async function adminGetSubscribers(): Promise<Subscriber[]> {
  const { data } = await supabase.from('subscribers').select('*').order('created_at', { ascending: false });
  return (data ?? []) as Subscriber[];
}

// ─── AI Analytics ─────────────────────────────────────────────────────────────
export async function callAiAnalytics(): Promise<{ analysis: string; stats: Record<string, unknown> }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
  });
  if (!response.ok) throw new Error(`AI Analytics request failed (${response.status})`);
  return response.json();
}
