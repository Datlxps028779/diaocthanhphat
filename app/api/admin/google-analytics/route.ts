import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import {
  getGoogleAnalyticsConfig,
  getGoogleAnalyticsConfigurationState,
  getGoogleAnalyticsReport,
  GoogleAnalyticsError,
  normalizeGoogleAnalyticsDays,
} from '@/lib/server/googleAnalytics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const configurationState = getGoogleAnalyticsConfigurationState();
  if (configurationState !== 'configured') {
    return NextResponse.json({ configurationState, report: null });
  }

  try {
    const config = getGoogleAnalyticsConfig();
    if (!config) return NextResponse.json({ configurationState: 'not_configured', report: null });
    const days = normalizeGoogleAnalyticsDays(req.nextUrl.searchParams.get('days'));
    const report = await getGoogleAnalyticsReport(config, days);
    return NextResponse.json({ configurationState, report });
  } catch (error) {
    console.error('[google-analytics] đọc báo cáo thất bại:', error instanceof Error ? error.message : error);
    const message = error instanceof GoogleAnalyticsError
      ? error.message
      : 'Không tải được báo cáo Google Analytics. Kiểm tra cấu hình server rồi thử lại.';
    return NextResponse.json({ error: message, configurationState }, { status: 503 });
  }
}
