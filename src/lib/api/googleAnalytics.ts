import { supabase } from '../supabase';

export type GoogleAnalyticsOverview = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  engagementRate: number;
};

export type GoogleAnalyticsReport = {
  days: number;
  startDate: string;
  endDate: string;
  overview: GoogleAnalyticsOverview;
  daily: Array<GoogleAnalyticsOverview & { date: string }>;
  topPages: Array<{ path: string; pageViews: number; activeUsers: number }>;
};

export type GoogleAnalyticsResponse = {
  configurationState: 'not_configured' | 'configured' | 'invalid';
  report: GoogleAnalyticsReport | null;
};

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ''}` };
}

export async function getGoogleAnalyticsReport(days: 7 | 30 | 90): Promise<GoogleAnalyticsResponse> {
  const response = await fetch(`/api/admin/google-analytics?days=${days}`, { headers: await authHeader() });
  const payload = await response.json().catch(() => ({})) as GoogleAnalyticsResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Không tải được báo cáo Google Analytics.');
  return payload;
}
