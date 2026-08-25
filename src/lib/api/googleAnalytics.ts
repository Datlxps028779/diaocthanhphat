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

export type GoogleAnalyticsDiagnostic = {
  ok: boolean;
  configurationState: 'not_configured' | 'configured' | 'invalid';
  stage: 'configuration' | 'token' | 'property_report';
  propertyId: string | null;
  serviceAccount: string | null;
  message: string;
  errorCode: string | null;
};

export type GoogleAnalyticsResponse = {
  configurationState: 'not_configured' | 'configured' | 'invalid';
  report: GoogleAnalyticsReport | null;
  diagnostic?: GoogleAnalyticsDiagnostic;
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

export async function diagnoseGoogleAnalytics(): Promise<GoogleAnalyticsDiagnostic> {
  const response = await fetch('/api/admin/google-analytics?diagnose=1', { headers: await authHeader() });
  const payload = await response.json().catch(() => ({})) as GoogleAnalyticsResponse;
  if (!response.ok && !payload.diagnostic) throw new Error((payload as { error?: string }).error || 'Không kiểm tra được Google Analytics.');
  if (!payload.diagnostic) throw new Error('Máy chủ không trả về kết quả chẩn đoán Google Analytics.');
  return payload.diagnostic;
}
